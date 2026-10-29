import { pool } from './src/db/pool.js';
import { labsService } from './src/modules/labs/labs.service.js';

labsService.createLab({
  name: 'Test Lab',
  status: 'ACTIVE'
}).then(console.log).catch(err => console.error("TEST ERROR:", err)).finally(() => process.exit());
