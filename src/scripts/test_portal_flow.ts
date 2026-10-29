const BASE_URL = 'http://localhost:4000/api';

async function req(url: string, options: any = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const body = options.body ? JSON.stringify(options.body) : undefined;
  const res = await fetch(`${BASE_URL}${url}`, {
    ...options,
    headers,
    body,
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!res.ok) {
    const error: any = new Error(`Request to ${url} failed with status ${res.status}`);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

async function run() {
  console.log('--- 1. Fetching labs from Admin API ---');
  const labs = await req('/labs');
  console.log(`Found ${labs.length} labs.`);
  const targetLab = labs[0];
  if (!targetLab) {
    console.error('No lab found to test with.');
    return;
  }
  console.log(`Target Lab: ${targetLab.name} (${targetLab.id})`);

  console.log('\n--- 2. Checking if portal account already exists or creating one ---');
  let portalAccount = null;
  try {
    const existing = await req(`/labs/${targetLab.id}/portal-account`);
    if (existing) {
      console.log('Portal account exists:', existing.username);
      portalAccount = existing;
    }
  } catch (err: any) {
    console.log('No existing portal account yet.');
  }

  const initialPassword = 'TempPassword123!';
  const newPassword = 'SecurePermanentPass456!';
  const username = `portal_${targetLab.name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`;

  if (!portalAccount) {
    console.log(`Creating portal account with username "${username}"...`);
    const createRes = await req(`/labs/${targetLab.id}/portal-account`, {
      method: 'POST',
      body: {
        username,
        email: targetLab.email || 'partner@diagnosticlab.com',
        password: initialPassword,
        sendEmail: false,
      },
    });
    console.log('Created successfully:', createRes);
    portalAccount = createRes.account;
  } else {
    console.log('Resetting password for test flow...');
    await req(`/labs/${targetLab.id}/portal-account/reset-password`, {
      method: 'POST',
      body: {
        newPassword: initialPassword,
        sendEmail: false,
      },
    });
    console.log('Reset password successfully.');
  }

  console.log('\n--- 3. Testing Client Portal Login with lab credentials ---');
  const loginRes = await req('/lab-portal/auth/login', {
    method: 'POST',
    body: {
      username: portalAccount.username || username,
      password: initialPassword,
    },
  });
  console.log('Login successful:');
  console.log({
    tokenExists: Boolean(loginRes.token),
    username: loginRes.user.username,
    must_change_password: loginRes.user.must_change_password,
    labName: loginRes.lab.name,
  });

  const clientToken = loginRes.token;
  const clientReq = (url: string, opts: any = {}) =>
    req(url, {
      ...opts,
      headers: { ...(opts.headers || {}), Authorization: `Bearer ${clientToken}` },
    });

  console.log('\n--- 4. Enforcing password change on first login ---');
  if (loginRes.user.must_change_password) {
    const changePassRes = await clientReq('/lab-portal/auth/change-password', {
      method: 'POST',
      body: { newPassword },
    });
    console.log('Change password response:', changePassRes);
  }

  console.log('\n--- 5. Testing Dashboard API ---');
  const dash = await clientReq('/lab-portal/dashboard');
  console.log('Dashboard Data:', {
    lab: dash.lab.name,
    profileCompletion: `${dash.profileCompletion}%`,
    totalServices: dash.totalServices,
    checklistCount: dash.checklist.length,
  });

  console.log('\n--- 6. Testing Lab Profile API ---');
  const profile = await clientReq('/lab-portal/profile');
  console.log('Profile loaded:', profile.name, profile.phone);

  console.log('Updating Lab Profile (hours & contact visibility)...');
  const updateRes = await clientReq('/lab-portal/profile', {
    method: 'PUT',
    body: {
      name: profile.name,
      phone: profile.phone,
      email: profile.email,
      address_line_1: profile.address_line_1,
      city: profile.city || 'Avalurpet',
      start_time: '07:30 AM',
      end_time: '09:00 PM',
      contact_visibility: true,
    },
  });
  console.log('Updated Profile start_time:', updateRes.start_time, 'end_time:', updateRes.end_time);

  console.log('\n--- 7. Testing Lab Services API ---');
  const initialServices = await clientReq('/lab-portal/services');
  console.log(`Current lab services count: ${initialServices.length}`);

  console.log('Adding new diagnostic service for this lab...');
  const addService = await clientReq('/lab-portal/services', {
    method: 'POST',
    body: {
      name: 'Thyroid Profile (T3, T4, TSH)',
      description: 'Comprehensive serum thyroid evaluation',
      price: 650,
      status: 'ACTIVE',
    },
  });
  console.log('Added Service:', addService.name, 'Price:', addService.price);

  const afterAdd = await clientReq('/lab-portal/services');
  console.log(`Updated count: ${afterAdd.length}`);

  console.log('Cleaning up test service...');
  await clientReq(`/lab-portal/services/${addService.id}`, { method: 'DELETE' });
  console.log('Service deleted successfully.');

  console.log('\n--- 8. Testing Account Info API ---');
  const account = await clientReq('/lab-portal/account');
  console.log('Account Info:', {
    username: account.username,
    email: account.email,
    lab_name: account.lab_name,
    must_change_password: account.must_change_password,
  });

  console.log('\n=== ALL END-TO-END CLIENT PORTAL TESTS PASSED! ===');
}

run().catch((err) => {
  console.error('Test Failed:', err.data || err.message);
  process.exit(1);
});
