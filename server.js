// BarangayConnect server (MySQL)
var express = require('express');
var bcrypt = require('bcryptjs');
var session = require('express-session');
var MySQLStore = require('express-mysql-session')(session);
var mysql = require('mysql2/promise');
var path = require('path');
 
var app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
 
// Configure TiDB Cloud or another MySQL-compatible database with environment variables.
var databaseUrl = process.env.DATABASE_URL;
var dbHost;
var dbConfig;

if (databaseUrl) {
  var parsedDatabaseUrl = new URL(databaseUrl);
  if (parsedDatabaseUrl.protocol !== 'mysql:' && parsedDatabaseUrl.protocol !== 'mysql2:') {
    throw new Error('DATABASE_URL must use the mysql:// or mysql2:// protocol.');
  }
  dbHost = parsedDatabaseUrl.hostname;
  dbConfig = {
    host: dbHost,
    port: Number(parsedDatabaseUrl.port) || 3306,
    user: decodeURIComponent(parsedDatabaseUrl.username),
    password: decodeURIComponent(parsedDatabaseUrl.password),
    database: decodeURIComponent(parsedDatabaseUrl.pathname.replace(/^\/+/, ''))
  };
} else {
  dbHost = process.env.DB_HOST || 'localhost';
  dbConfig = {
    host: dbHost,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'barangay_db'
  };
}

var sslSetting = process.env.DB_SSL;
if (sslSetting && sslSetting !== 'true' && sslSetting !== 'false') {
  throw new Error('DB_SSL must be set to "true" or "false".');
}
var useTls = sslSetting === 'true' ||
  (sslSetting !== 'false' && dbHost !== 'localhost' && dbHost !== '127.0.0.1');
if (useTls) {
  dbConfig.ssl = { rejectUnauthorized: true };
  if (process.env.DB_SSL_CA) {
    dbConfig.ssl.ca = process.env.DB_SSL_CA;
  }
}

var db = mysql.createPool(dbConfig);

var sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret.length < 32) {
  throw new Error('SESSION_SECRET must be set to a random value of at least 32 characters.');
}
var sessionStore = new MySQLStore({}, db);
app.use(session({
  name: 'barangayconnect.sid',
  secret: sessionSecret,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: 'auto',
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000
  }
}));
app.use(express.static(path.join(__dirname, 'public')));

function establishSession(req, userId) {
  return new Promise(function (resolve, reject) {
    req.session.regenerate(function (error) {
      if (error) {
        reject(error);
        return;
      }
      req.session.userId = userId;
      req.session.save(function (saveError) {
        if (saveError) {
          reject(saveError);
          return;
        }
        resolve();
      });
    });
  });
}

// REGISTER
app.post('/api/register', async function (req, res) {
  var body = req.body || {};
  var name = typeof body.full_name === 'string' ? body.full_name.trim() : '';
  var email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  var password = typeof body.password === 'string' ? body.password : '';
 
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Please fill in all fields.' });
  }
  if (name.length > 100 || email.length > 100) {
    return res.status(400).json({ error: 'Name and email must be 100 characters or fewer.' });
  }
  if (password.length < 6 || Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({ error: 'Password must be at least 6 characters and no more than 72 bytes.' });
  }
 
  try {
    // check if the email is already used
    var result = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (result[0].length > 0) {
      return res.status(400).json({ error: 'That email is already registered.' });
    }
 
    var hash = await bcrypt.hash(password, 10);
    var insertResult = await db.query(
      'INSERT INTO users (full_name, email, password_hash) VALUES (?, ?, ?)',
      [name, email, hash]
    );
    var userId = insertResult[0].insertId;
    await establishSession(req, userId);
    res.json({ user: { id: userId, full_name: name, role: 'resident' } });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});
 
// LOGIN
app.post('/api/login', async function (req, res) {
  try {
    var body = req.body || {};
    var email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    var password = typeof body.password === 'string' ? body.password : '';
    if (!email || !password) {
      return res.status(400).json({ error: 'Please enter your email and password.' });
    }

    var result = await db.query(
      'SELECT id, full_name, password_hash, role FROM users WHERE email = ?',
      [email]
    );
    var user = result[0][0];
 
    if (!user) {
      return res.status(401).json({ error: 'Email or password is wrong.' });
    }
    var correct = await bcrypt.compare(password, user.password_hash);
    if (!correct) {
      return res.status(401).json({ error: 'Email or password is wrong.' });
    }
    await establishSession(req, user.id);
    res.json({ user: { id: user.id, full_name: user.full_name, role: user.role } });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

app.get('/api/me', async function (req, res) {
  if (!req.session.userId) {
    return res.json({ user: null });
  }
  try {
    var result = await db.query(
      'SELECT id, full_name, role FROM users WHERE id = ?',
      [req.session.userId]
    );
    var user = result[0][0];
    if (!user) {
      return res.json({ user: null });
    }
    res.json({ user: user });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Could not restore your sign-in. Please try again.' });
  }
});

app.post('/api/logout', function (req, res) {
  req.session.destroy(function (error) {
    if (error) {
      console.log(error);
      return res.status(500).json({ error: 'Could not log out. Please try again.' });
    }
    res.clearCookie('barangayconnect.sid', {
      httpOnly: true,
      secure: 'auto',
      sameSite: 'lax'
    });
    res.json({ ok: true });
  });
});

var requestStatuses = ['Received', 'In Review', 'Approved', 'Rejected', 'Completed'];

async function requireAdmin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Please log in as an administrator.' });
  }
  try {
    var result = await db.query(
      'SELECT id, role FROM users WHERE id = ?',
      [req.session.userId]
    );
    var user = result[0][0];
    if (!user) {
      return res.status(401).json({ error: 'Please log in again.' });
    }
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Administrator access is required.' });
    }
    next();
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Could not verify administrator access.' });
  }
}

app.get('/api/admin/requests', requireAdmin, async function (req, res) {
  try {
    var result = await db.query(
      'SELECT r.reference, r.service_code, s.name AS service, r.full_name, r.contact, ' +
      'r.details, r.status, r.created_at, r.updated_at ' +
      'FROM requests r JOIN services s ON s.code = r.service_code ' +
      'ORDER BY r.created_at DESC'
    );
    res.json({ requests: result[0] });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Could not load service requests.' });
  }
});

app.patch('/api/admin/requests/:reference', requireAdmin, async function (req, res) {
  var body = req.body || {};
  var status = typeof body.status === 'string' ? body.status.trim() : '';
  var reference = req.params.reference.trim().toUpperCase();
  if (requestStatuses.indexOf(status) === -1) {
    return res.status(400).json({ error: 'Choose a valid request status.' });
  }

  try {
    var found = await db.query(
      'SELECT id FROM requests WHERE reference = ?',
      [reference]
    );
    if (found[0].length === 0) {
      return res.status(404).json({ error: 'Service request not found.' });
    }
    await db.query(
      'UPDATE requests SET status = ? WHERE reference = ?',
      [status, reference]
    );
    res.json({ reference: reference, status: status });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Could not update the request status.' });
  }
});

app.delete('/api/admin/requests/:reference', requireAdmin, async function (req, res) {
  var reference = req.params.reference.trim().toUpperCase();
  try {
    var result = await db.query(
      'DELETE FROM requests WHERE reference = ?',
      [reference]
    );
    if (result[0].affectedRows === 0) {
      return res.status(404).json({ error: 'Service request not found.' });
    }
    res.json({ deleted: true, reference: reference });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Could not delete the service request.' });
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
 
var port = Number(process.env.PORT) || 3000;
sessionStore.onReady().then(function () {
  app.listen(port, function () {
    console.log('Server running on port ' + port);
  });
}).catch(function (error) {
  console.error('Could not initialize the session store:', error);
  process.exit(1);
});
 
