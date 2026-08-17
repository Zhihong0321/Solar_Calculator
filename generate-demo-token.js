const jwt = require('jsonwebtoken');

const JWT_SECRET = 'local-test-secret-do-not-use-in-prod';

// Create a demo user payload
const payload = {
  bubble_id: 'demo-user-123',
  user_id: 1,
  email: 'demo@example.com',
  name: 'Demo User',
  role: 'agent'
};

const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });

console.log('Demo Auth Token:');
console.log(token);
