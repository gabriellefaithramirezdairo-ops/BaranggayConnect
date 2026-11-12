// BaranggayConnect server (MySQL)
var express = require('express');
var bcrypt = require('bcryptjs');
var mysql = require('mysql2/promise');
 
var app = express();
app.use(express.json());
app.use(express.static('public'));
 
// connect to MySQL - change these to match your computer
var db = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'barangay_db'
});
 
// REGISTER
app.post('/api/register', async function (req, res) {
  var name = req.body.full_name;
  var email = req.body.email;
  var password = req.body.password;
 
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Please fill in all fields.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
 
  try {
    // check if the email is already used
    var result = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (result[0].length > 0) {
      return res.status(400).json({ error: 'That email is already registered.' });
    }
 
    var hash = bcrypt.hashSync(password, 10);
    await db.query('INSERT INTO users (full_name, email, password_hash) VALUES (?, ?, ?)', [name, email, hash]);
    res.json({ full_name: name });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});
 
// LOGIN
app.post('/api/login', async function (req, res) {
  try {
    var result = await db.query('SELECT * FROM users WHERE email = ?', [req.body.email]);
    var user = result[0][0];
 
    if (!user) {
      return res.status(401).json({ error: 'Email or password is wrong.' });
    }
    var correct = bcrypt.compareSync(req.body.password, user.password_hash);
    if (!correct) {
      return res.status(401).json({ error: 'Email or password is wrong.' });
    }
    res.json({ full_name: user.full_name });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});
 
async function findExistingRequest(code, name, contact) {
  var result = await db.query(
    'SELECT reference, status FROM requests ' +
    'WHERE service_code = ? AND LOWER(TRIM(full_name)) = LOWER(TRIM(?)) AND contact = ? ' +
    'ORDER BY created_at DESC LIMIT 1',
    [code, name, contact]
  );
  return result[0][0];
}

// Check whether the applicant has already filed this service request
app.post('/api/requests/check', async function (req, res) {
  var code = req.body.service_code;
  var name = typeof req.body.full_name === 'string' ? req.body.full_name.trim() : '';
  var contact = typeof req.body.contact === 'string' ? req.body.contact.trim() : '';

  if (!code || !name || !contact) {
    return res.status(400).json({ error: 'Please enter your name and contact number.' });
  }

  try {
    var existing = await findExistingRequest(code, name, contact);
    if (existing) {
      return res.json({
        alreadyExists: true,
        reference: existing.reference,
        status: existing.status
      });
    }
    res.json({ alreadyExists: false });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Could not check your request. Please try again.' });
  }
});

// SUBMIT a request
app.post('/api/requests', async function (req, res) {
  var code = req.body.service_code;
  var name = typeof req.body.full_name === 'string' ? req.body.full_name.trim() : '';
  var contact = typeof req.body.contact === 'string' ? req.body.contact.trim() : '';
  var details = typeof req.body.details === 'string' ? req.body.details : '';

  if (!name || !contact) {
    return res.status(400).json({ error: 'Please enter your name and contact number.' });
  }

  // make a reference number like BC-LX3K9A
  var reference = 'BC-' + Date.now().toString(36).toUpperCase();
 
  try {
    var existing = await findExistingRequest(code, name, contact);
    if (existing) {
      return res.json({
        alreadyExists: true,
        reference: existing.reference,
        status: existing.status
      });
    }

    await db.query(
      'INSERT INTO requests (reference, service_code, full_name, contact, details) VALUES (?, ?, ?, ?, ?)',
      [reference, code, name, contact, details]
    );
    res.json({ reference: reference });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Could not save your request. Please try again.' });
  }
});
 
// TRACK a request
app.get('/api/requests/:reference', async function (req, res) {
  var ref = req.params.reference.toUpperCase();
 
  try {
    var result = await db.query(
      'SELECT r.reference, r.status, r.updated_at, s.name AS service ' +
      'FROM requests r JOIN services s ON s.code = r.service_code WHERE r.reference = ?',
      [ref]
    );
    var row = result[0][0];
 
    if (!row) {
      return res.status(404).json({ error: 'No request found with that reference number.' });
    }
    res.json(row);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});
 
app.listen(3000, function () {
  console.log('Server running at http://localhost:3000');
});
 