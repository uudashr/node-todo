const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const app = express();

const PORT = 3500;
const SECRET = 'secret';
// const COOKIE_USER_FINGERPRINT = "__Secure-Fgp" // for https
const COOKIE_USER_FINGERPRINT = "Fgp" // for http

let accounts = [
  { email: 'uudashr@gmail.com', name: 'Nuruddin Ashr', password: 'secret' },
];

let taskSequenceId = 3;
let tasks = [
  { id: 1, name: 'Follow up SRE Support', completed: true, ownerId: 'uudashr@gmail.com' },
  { id: 2, name: 'Read IAM Service Spec', ownerId: 'uudashr@gmail.com' },
  { id: 3, name: 'Research chat protocols', ownerId: 'uudashr@gmail.com' },
];

app.use(express.json());
app.use(express.text());
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(cookieParser());
app.use(delay(500));

function delay(ms) {
  return (req, res, next) => {
    setTimeout(() => next(), ms);
  };
}

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.get('/dev/accounts', (req, res) => {
  res.send(accounts);
});

function errorPayload(code, message) {
  return { 
    error: { code, message } 
  };
}

app.post('/register', (req, res) => {
  const { email, name, password } = req.body;
  const acc = accounts.find(acc => acc.email === email);
  if (acc) {
    return res.status(409).send(errorPayload('email_used',  'Email already used'));
  }

  accounts = [...accounts, { email, name, password }];
  return res.status(201).send('created');
});

function buildTokenPayload(type) {
  if (type === 'web') {
    const userFingerprint = crypto.randomBytes(50).toString('hex');
    return { userFingerprint };
  }

  return {};
}

app.post('/authenticate', (req, res) => {
  const { email, password, type } = req.body;

  const acc = accounts.find(acc => acc.email === email && acc.password === password);
  if (!acc) {
    return res.status(401).send(errorPayload('invalid_credentials', 'Invalid username or password'));
  }

  const payload = buildTokenPayload(type);
  const token = jwt.sign(payload, SECRET, {
    subject: acc.email,
    expiresIn: '60m'
  });

  if (payload.userFingerprint) {
    // res.cookie(COOKIE_USER_FINGERPRINT, payload.userFingerprint, { sameSite: 'strict', httpOnly: true, secure: true });
    res.cookie(COOKIE_USER_FINGERPRINT, payload.userFingerprint, { sameSite: 'strict', httpOnly: true });
  }

  return res.status(201).send({ token });
});

function authChecks(req, res, next) {
  const authHeader = req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).send('unauthorized');
  }

  const accessToken = authHeader.substring('Bearer '.length)
  try {
    const payload = jwt.verify(accessToken, SECRET);

    if (payload.userFingerprint && (payload.userFingerprint !== req.cookies[COOKIE_USER_FINGERPRINT])) {
      return res.status(401).send('unauthorized');
    }

    req.authenticatedId = payload.sub;

    next();
  } catch (e) {
    return res.status(401).send(e.message);
  }
}

app.get('/userinfo', authChecks, (req, res) => {
  const acc = accounts.find(acc => acc.email === req.authenticatedId)
  if (!acc) {
    return res.status(404).send('not found');
  }

  const { email, name } = acc;
  res.send({ email, name });
});

app.get('/tasks', authChecks, (req, res) => {
  const queryCompleted = req.query.completed;
  const filteredTasks = tasks.filter(task => {
    return task.ownerId === req.authenticatedId
  }).filter(task => {
    if (queryCompleted === 'true') {
      return task.completed;
    }

    if (queryCompleted === 'false') {
      const completed = task.completed || false
      return !completed;
    }

    return true;
  }).map(({ id, name, completed }) => ({ id, name, completed }));

  res.send(filteredTasks);
});

app.post('/tasks', authChecks, (req, res) => {
  const { name } = req.body;
  const id = ++taskSequenceId;
  tasks = [...tasks, { id, name, ownerId: req.authenticatedId }];
  res.status(201).send('created');
});

app.get('/tasks/:id', authChecks, (req, res) => {
  const paramId = parseInt(req.params.id, 10);
  const found = tasks.find(task => (
    task.id === paramId &&
    task.ownerId === req.authenticatedId
  ));

  if (!found) {
    return res.status(404).send('not found');
  }

  const { id, name, completed } = found;
  return res.send({ id, name, completed });
});

app.put('/tasks/:id', authChecks, (req, res) => {
  const paramId = parseInt(req.params.id);
  const found = tasks.find(task => (
    task.id === paramId &&
    task.ownerId === req.authenticatedId
  ));

  if (!found) {
    return res.status(404).send('not found');
  }

  const { name, completed } = req.body;
  tasks = tasks.map(task => {
    if (task.id == found.id) {
      return { ...task, name, completed }
    }

    return task
  })

  return res.status(204).send('no content');
});

app.delete('/tasks/:id', authChecks, (req, res) => {
  const paramId = parseInt(req.params.id, 10);
  const found = tasks.find(task => (
    task.id === paramId && 
    task.ownerId === req.authenticatedId
  ));

  if (!found) {
    return res.status(404).send('not found');
  }

  tasks = tasks.filter(task => task.id !== found.id);
  return res.status(204).send('no content');
});

app.put('/tasks/:id/name', authChecks, (req, res) => {
  const paramId = parseInt(req.params.id, 10);
  const nameValue = req.body;
  if (!nameValue) {
    return res.status(400).send(errorPayload('empty_name', 'Name is empty'));
  }

  const found = tasks.find(task => (
    task.id === paramId && task.ownerId === req.authenticatedId
  ));
  if (!found) {
    return res.status(404).send('not found');
  }

  tasks = tasks.map(task => {
    if (task.id === found.id) {
      return  { ...task, name: nameValue };
    }

    return task;
  })
  return res.status(204).send('no content');
});

app.put('/tasks/:id/completed', authChecks, (req, res) => {
  const paramId = parseInt(req.params.id, 10);
  const found = tasks.find(task => (
    task.id === paramId && task.ownerId === req.authenticatedId
  ));
  if (!found) {
    return res.status(404).send('not found');
  }


  tasks = tasks.map(task => {
    if (task.id === found.id) {
      return  { ...task, completed: true };
    }

    return task;
  })
  return res.status(204).send('no content');
});

app.delete('/tasks/:id/completed', authChecks, (req, res) => {
  const paramId = parseInt(req.params.id, 10);
  const found = tasks.find(task => (
    task.id === paramId && task.ownerId === req.authenticatedId
  ));
  if (!found) {
    return res.status(404).send('not found');
  }

  tasks = tasks.map(task => {
    if (task.id === found.id) {
      const { completed, ...taskRest } = task;
      return taskRest;
    }

    return task;
  })
  return res.status(204).send('no content');
});

app.listen(PORT, () => {
  console.log(`Node Todo listening on port ${PORT}`);
});