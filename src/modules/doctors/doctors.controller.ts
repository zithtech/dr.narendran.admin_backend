 
import type { Request, Response } from 'express';
import { z } from 'zod';

import { pool } from '@/db/pool.js';
import { logger } from '@/lib/logger.js';

import { doctorsService } from './doctors.service.js';

const doctorSchema = z.object({
  hospital_id: z.union([z.string().uuid(), z.literal(''), z.null()]).optional().nullable(),
  branch_id: z.union([z.string().uuid(), z.literal(''), z.null()]).optional().nullable(),
  user_account_id: z.union([z.string().uuid(), z.literal(''), z.null()]).optional().nullable(),
  name: z.string().min(1),
  phone: z.string().optional().nullable(),
  email: z.union([z.string().email(), z.literal(''), z.null()]).optional().nullable(),
  specialization: z.string().optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  qualification: z.string().optional().nullable(),
  medical_registration_number: z.string().optional().nullable(),
  clinic_address: z.string().optional().nullable(),
  years_of_experience: z.number().optional().nullable(),
  profile_image_url: z.string().optional().nullable(),
  podcast_url: z.string().optional().nullable(),
  is_active: z.boolean().optional().nullable(),
});

export const CURRENT_TERMS_VERSION = 'v1.0';

export const DoctorsController = {
  async getMe(req: Request, res: Response) {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const client = await pool.connect();
      try {
        const userRes = await client.query('SELECT username FROM user_accounts WHERE id = $1', [req.user.id]);
        const username = userRes.rows[0]?.username;

        // Then get the doctor record
        const { rows } = await client.query(
          'SELECT * FROM doctors WHERE user_account_id = $1 OR phone = $2 LIMIT 1',
          [req.user.id, username]
        );

        let doctor = rows[0];

        // Fetch from doctor_profiles as a fallback/merge
        const profileRes = await client.query('SELECT * FROM doctor_profiles WHERE user_id = $1', [req.user.id]);
        const profileRecord = profileRes.rows[0];

        if (!doctor && !profileRecord) {
          if (req.user.role === 'doctor') {
            res.json({
              id: req.user.id,
              name: username || 'Doctor',
              phone: username,
              terms_accepted: false,
              terms_accepted_at: null,
              terms_version: null,
              current_terms_version: CURRENT_TERMS_VERSION,
              requires_terms_acceptance: true,
            });
            return;
          }
          res.status(404).json({ error: 'Doctor not found' });
          return;
        }

        if (!doctor && profileRecord) {
          let specialtyName = profileRecord.specialty || profileRecord.specialty_id;
          if (profileRecord.specialty_id) {
            const sp = await client.query('SELECT name FROM specialties WHERE id = $1', [profileRecord.specialty_id]);
            if (sp.rows.length) specialtyName = sp.rows[0].name;
          }

          // Construct a doctor-like object from profileRecord
          doctor = {
            name: profileRecord.full_name,
            phone: profileRecord.contact_phone || username,
            email: profileRecord.contact_email,
            qualification: profileRecord.qualifications,
            medical_registration_number: profileRecord.registration_number,
            clinic_address: profileRecord.clinic_address,
            years_of_experience: profileRecord.experience_years,
            specialization: specialtyName,
            clinic_name: profileRecord.clinic_name,
          };
        } else if (doctor && profileRecord) {
          let specialtyName = profileRecord.specialty || profileRecord.specialty_id;
          if (profileRecord.specialty_id) {
            const sp = await client.query('SELECT name FROM specialties WHERE id = $1', [profileRecord.specialty_id]);
            if (sp.rows.length) specialtyName = sp.rows[0].name;
          }

          let hospitalName = '';
          if (doctor.hospital_id) {
            const hosp = await client.query('SELECT name FROM hospitals WHERE id = $1', [doctor.hospital_id]);
            if (hosp.rows.length) hospitalName = hosp.rows[0].name;
          }

          // Merge both
          doctor = {
            ...doctor,
            name: profileRecord.full_name || doctor.name,
            qualification: doctor.qualification || profileRecord.qualifications,
            medical_registration_number: doctor.medical_registration_number || profileRecord.registration_number,
            clinic_address: doctor.clinic_address || profileRecord.clinic_address,
            years_of_experience: doctor.years_of_experience || profileRecord.experience_years,
            specialization: doctor.specialization || specialtyName,
            clinic_name: profileRecord.clinic_name || hospitalName,
          };
        } else if (doctor && !profileRecord) {
          let hospitalName = '';
          if (doctor.hospital_id) {
            const hosp = await client.query('SELECT name FROM hospitals WHERE id = $1', [doctor.hospital_id]);
            if (hosp.rows.length) hospitalName = hosp.rows[0].name;
          }
          doctor.clinic_name = hospitalName;
        }

        const isAccepted = Boolean(doctor.terms_accepted);
        const termsVersion = doctor.terms_version || null;
        const requiresTerms = !isAccepted || termsVersion !== CURRENT_TERMS_VERSION;

        res.json({
          ...doctor,
          terms_accepted: isAccepted,
          terms_accepted_at: doctor.terms_accepted_at || null,
          terms_version: termsVersion,
          current_terms_version: CURRENT_TERMS_VERSION,
          requires_terms_acceptance: requiresTerms,
        });
      } finally {
        client.release();
      }
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch doctor profile' });
    }
  },

  async updateMe(req: Request, res: Response) {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const data = req.body;
      const client = await pool.connect();
      try {
        const userRes = await client.query('SELECT username FROM user_accounts WHERE id = $1', [req.user.id]);
        const username = userRes.rows[0]?.username;

        const { rows } = await client.query(
          'SELECT * FROM doctors WHERE user_account_id = $1 OR phone = $2 LIMIT 1',
          [req.user.id, username]
        );
        const doctor = rows[0];
        if (!doctor) {
          res.status(404).json({ error: 'Doctor not found' });
          return;
        }

        const name = data.fullName || doctor.name;
        const email = data.contactEmail || doctor.email;
        const specialization = data.specialtyId || data.specialization || doctor.specialization;
        const qualification = data.qualifications || data.qualification || doctor.qualification;
        const medical_registration_number = data.registrationNumber || data.medical_registration_number || doctor.medical_registration_number;
        const clinic_address = data.clinicAddress || data.clinic_address || doctor.clinic_address;
        const years_of_experience = data.experienceYears !== undefined ? data.experienceYears : (data.years_of_experience || data.yearsOfExperience || doctor.years_of_experience);
        const is_active = data.is_active !== undefined ? data.is_active : doctor.is_active;

        const updated = await doctorsService.updateDoctor({
          id: doctor.id,
          hospital_id: doctor.hospital_id,
          branch_id: doctor.branch_id,
          name,
          phone: doctor.phone,
          email,
          specialization,
          status: doctor.status,
          user_account_id: doctor.user_account_id,
          qualification,
          medical_registration_number,
          clinic_address,
          years_of_experience,
          is_active: is_active !== undefined && is_active !== null ? is_active : true,
        });

        res.json(updated);
      } finally {
        client.release();
      }
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to update doctor profile', details: err.message });
    }
  },

  async acceptTerms(req: Request, res: Response) {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { version, agreed } = req.body;
      if (!agreed) {
        res.status(400).json({ error: 'You must agree to the Terms and Conditions' });
        return;
      }

      const policyVersion = version || CURRENT_TERMS_VERSION;
      const client = await pool.connect();
      try {
        const userRes = await client.query('SELECT username FROM user_accounts WHERE id = $1', [req.user.id]);
        const username = userRes.rows[0]?.username;

        const docRes = await client.query(
          'SELECT id FROM doctors WHERE user_account_id = $1 OR phone = $2 LIMIT 1',
          [req.user.id, username]
        );

        let doctorId = docRes.rows[0]?.id;

        if (!doctorId) {
          const createRes = await client.query(
            `INSERT INTO doctors (user_account_id, name, phone, status, terms_accepted, terms_accepted_at, terms_version)
             VALUES ($1, $2, $3, 'ACTIVE', true, NOW(), $4)
             ON CONFLICT (user_account_id) DO UPDATE SET 
               terms_accepted = true,
               terms_accepted_at = NOW(),
               terms_version = $4
             RETURNING id`,
            [req.user.id, username || 'Doctor', username, policyVersion]
          );
          doctorId = createRes.rows[0]?.id;
        } else {
          await client.query(
            `UPDATE doctors 
             SET terms_accepted = true, 
                 terms_accepted_at = NOW(), 
                 terms_version = $1,
                 updated_at = NOW()
             WHERE id = $2`,
            [policyVersion, doctorId]
          );
        }

        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
        const userAgent = req.headers['user-agent'] || '';

        await client.query(
          `INSERT INTO doctor_terms_acceptances (doctor_id, user_account_id, terms_version, privacy_version, ip_address, user_agent)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [doctorId, req.user.id, policyVersion, 'v1.0', String(ip), String(userAgent)]
        );

        res.json({
          success: true,
          message: 'Terms and conditions accepted successfully',
          terms_accepted: true,
          terms_version: policyVersion,
          terms_accepted_at: new Date().toISOString(),
        });
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.error('Error accepting terms:', err);
      res.status(500).json({ error: 'Failed to record terms acceptance' });
    }
  },

    async getDoctorLocationsById(req: Request, res: Response) {
    try {
      const id = String(req.params['id']);
      if (!id) {
        res.status(400).json({ error: 'Invalid doctor ID' });
        return;
      }
      const client = await pool.connect();
      try {
        const { rows } = await client.query(
          `SELECT id, location_name, address, map_link, is_primary 
           FROM doctor_locations 
           WHERE (doctor_id = $1 OR doctor_id = (SELECT user_account_id FROM doctors WHERE id = $1))
             AND UPPER(COALESCE(status, 'ACTIVE')) = 'ACTIVE'
           ORDER BY is_primary DESC, created_at ASC`,
          [id]
        );

        if (rows.length > 0) {
          res.json({ status: 'success', data: rows });
          return;
        }

        const docRes = await client.query(
          `SELECT d.id, d.name, d.clinic_address, h.name as hospital_name, b.id as branch_id, b.name as branch_name, b.address as branch_address
           FROM doctors d
           LEFT JOIN hospitals h ON d.hospital_id = h.id
           LEFT JOIN hospital_branches b ON d.branch_id = b.id
           WHERE d.id = $1 OR d.user_account_id = $1 LIMIT 1`,
          [id]
        );

        if (docRes.rows.length > 0) {
          const doc = docRes.rows[0];
          const defaultLocName = doc.branch_name 
            ? `${doc.hospital_name || 'Hospital'} - ${doc.branch_name}` 
            : (doc.hospital_name || 'Primary Clinic');
          res.json({
            status: 'success',
            data: [
              {
                id: doc.branch_id || doc.id,
                location_name: defaultLocName,
                address: doc.branch_address || doc.clinic_address || 'Adyar, Chennai',
                is_primary: true,
              },
            ],
          });
          return;
        }

        res.json({ status: 'success', data: [] });
      } finally {
        client.release();
      }
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch doctor locations' });
    }
  },
  async getLocations(req: Request, res: Response) {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    try {
      const { rows } = await pool.query(
        'SELECT * FROM doctor_locations WHERE doctor_id = $1 ORDER BY created_at ASC',
        [req.user.id]
      );
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch locations' });
    }
  },

  async createLocation(req: Request, res: Response) {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const { location_name, address, map_link, is_primary, status } = req.body;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (is_primary) {
        await client.query('UPDATE doctor_locations SET is_primary = false WHERE doctor_id = $1', [req.user.id]);
      }
      const { rows } = await client.query(
        `INSERT INTO doctor_locations (doctor_id, location_name, address, map_link, is_primary, status)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [req.user.id, location_name, address || null, map_link || null, is_primary || false, status || 'Active']
      );
      
      const primaryCheck = await client.query('SELECT id FROM doctor_locations WHERE doctor_id = $1 AND is_primary = true', [req.user.id]);
      if (primaryCheck.rowCount === 0) {
        await client.query('UPDATE doctor_locations SET is_primary = true WHERE id = $1', [rows[0].id]);
        rows[0].is_primary = true;
      }
      await client.query('COMMIT');
      res.status(201).json(rows[0]);
    } catch (err: any) {
      await client.query('ROLLBACK');
      logger.error({ err }, 'ERROR IN createLocation');
      res.status(500).json({ error: 'Failed to create location', details: err.message, stack: err.stack });
    } finally {
      client.release();
    }
  },

  async updateLocation(req: Request, res: Response) {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const { id } = req.params;
    const { location_name, address, map_link, status } = req.body;
    try {
      const { rows } = await pool.query(
        `UPDATE doctor_locations 
         SET location_name = $1, address = $2, map_link = $3, status = $4, updated_at = now()
         WHERE id = $5 AND doctor_id = $6 RETURNING *`,
        [location_name, address || null, map_link || null, status || 'Active', id, req.user.id]
      );
      if (rows.length === 0) {
        res.status(404).json({ error: 'Location not found' });
        return;
      }
      res.json(rows[0]);
    } catch (err) {
      res.status(500).json({ error: 'Failed to update location' });
    }
  },

  async deleteLocation(req: Request, res: Response) {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const { id } = req.params;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const loc = await client.query('SELECT is_primary FROM doctor_locations WHERE id = $1 AND doctor_id = $2', [id, req.user.id]);
      if (loc.rowCount === 0) {
        res.status(404).json({ error: 'Location not found' });
        return;
      }
      if (loc.rows[0].is_primary) {
        res.status(400).json({ error: 'Cannot delete primary location. Set another location as primary first.' });
        return;
      }
      await client.query('DELETE FROM doctor_locations WHERE id = $1 AND doctor_id = $2', [id, req.user.id]);
      await client.query('COMMIT');
      res.json({ message: 'Location deleted successfully' });
    } catch (err) {
      await client.query('ROLLBACK');
      res.status(500).json({ error: 'Failed to delete location' });
    } finally {
      client.release();
    }
  },

  async setPrimaryLocation(req: Request, res: Response) {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const { id } = req.params;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const check = await client.query('SELECT id FROM doctor_locations WHERE id = $1 AND doctor_id = $2', [id, req.user.id]);
      if (check.rowCount === 0) {
        res.status(404).json({ error: 'Location not found' });
        return;
      }
      await client.query('UPDATE doctor_locations SET is_primary = false WHERE doctor_id = $1', [req.user.id]);
      await client.query('UPDATE doctor_locations SET is_primary = true WHERE id = $1', [id]);
      await client.query('COMMIT');
      res.json({ message: 'Primary location updated successfully' });
    } catch (err) {
      await client.query('ROLLBACK');
      res.status(500).json({ error: 'Failed to set primary location' });
    } finally {
      client.release();
    }
  },

  async getAll(req: Request, res: Response) {
    try {
      const speciality = req.query['speciality'] as string || req.query['specialization'] as string;
      const search = req.query['search'] as string;
      const clinic = req.query['clinic'] as string;
      const status = req.query['status'] as string;

      const doctors = await doctorsService.getAllDoctors({ speciality, search, clinic, status });
      res.json({ status: 'success', data: doctors });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch doctors', details: err.message });
    }
  },

  async getById(req: Request, res: Response) {
    try {
      const id = String(req.params['id']);
      if (!id) {
        res.status(400).json({ error: 'Invalid doctor ID' });
        return;
      }
      const doctor = await doctorsService.getDoctorById(id);
      if (!doctor) {
        res.status(404).json({ error: 'Doctor not found' });
        return;
      }
      res.json({ status: 'success', data: doctor });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch doctor details' });
    }
  },

  async create(req: Request, res: Response) {
    try {
      const data = doctorSchema.parse(req.body);
      const cleanData = {
        ...data,
        hospital_id: data.hospital_id || null,
        email: data.email || null,
        phone: data.phone || null,
        specialization: data.specialization || null,
        branch_id: data.branch_id || null,
        user_account_id: data.user_account_id || null,
        qualification: data.qualification || null,
        medical_registration_number: data.medical_registration_number || null,
        clinic_address: data.clinic_address || null,
        years_of_experience: data.years_of_experience || null,
        profile_image_url: data.profile_image_url || null,
        podcast_url: data.podcast_url || null,
        is_active: data.is_active !== undefined ? data.is_active : true,
      };
      const doctor = await doctorsService.createDoctor(cleanData);
      res.status(201).json({ status: 'success', data: doctor });
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: (err as any).issues[0].message });
        return;
      }
      res.status(500).json({ error: 'Failed to create doctor' });
    }
  },

  async update(req: Request, res: Response) {
    try {
      const id = String(req.params['id']);
      if (!id) {
        res.status(400).json({ error: 'Invalid doctor ID' });
        return;
      }
      const data = doctorSchema.parse(req.body);
      const cleanData = {
        ...data,
        hospital_id: data.hospital_id || null,
        email: data.email || null,
        phone: data.phone || null,
        specialization: data.specialization || null,
        branch_id: data.branch_id || null,
        user_account_id: data.user_account_id || null,
        qualification: data.qualification || null,
        medical_registration_number: data.medical_registration_number || null,
        clinic_address: data.clinic_address || null,
        years_of_experience: data.years_of_experience || null,
        profile_image_url: data.profile_image_url || null,
        podcast_url: data.podcast_url || null,
        is_active: data.is_active !== undefined ? data.is_active : true,
      };
      const doctor = await doctorsService.updateDoctor({ id, ...cleanData });
      if (!doctor) {
        res.status(404).json({ error: 'Doctor not found' });
        return;
      }
      res.json({ status: 'success', data: doctor });
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: (err as any).issues[0].message });
        return;
      }
      res.status(500).json({ error: 'Failed to update doctor' });
    }
  },

  async delete(req: Request, res: Response) {
    try {
      const id = String(req.params['id']);
      if (!id) {
        res.status(400).json({ error: 'Invalid doctor ID' });
        return;
      }
      const success = await doctorsService.deleteDoctor(id);
      if (!success) {
        res.status(404).json({ error: 'Doctor not found' });
        return;
      }
      res.status(204).send();
    } catch (err: unknown) {
      res.status(500).json({ error: 'Failed to delete doctor' });
    }
  },
};
