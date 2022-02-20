const express = require('express');
const jwt = require('jsonwebtoken');
var cookieParser = require('cookie-parser');
const app = express();

const port = 3000;
const secret = 'secret';

let accounts = [
  { email: 'uudashr@gmail.com', passwod: 'secret' },
];

let taskSequenceId = 0;
let tasks = [];

app.use(express.json());
app.use(cookieParser());

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.get('/dev/accounts', (req, res) => {
  res.json(accounts);
});

app.post('/signup', async (req, res) => {
  const { email, password } = req.body;
  if (accounts.find((acc) => acc.email === email)) {
    return res.status(409).send('conflict');
  }

  accounts = [...accounts, { email, password }];
  return res.status(201).send('created');
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  const acc = accounts.find((acc) => acc.email === email && acc.passwod == password);
  if (!acc) {
    return res.status(404).send('not found');
  }

  const userFingerprint = 'The-secure-user-fingerprint';
  const payload = {
    userFingerprint
  };
  const token = jwt.sign(payload, secret, {
    subject: acc.email,
    expiresIn: '60m'
  });

  res.cookie('__Secure-Fgp', userFingerprint, {httpOnly: true, sameSite: 'strict'});

  return res.status(201).json({ token });
});

function authChecks(req, res, next) {
  const authHeader = req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).send('unauthorized');
  }

  const accessToken = authHeader.substring('Bearer '.length)
  try {
    const payload = jwt.verify(accessToken, secret);
    // res.json({accessToken, payload});
    req.authenticatedId = payload.subject;

    // For web/cookie enabled only
    // if (!req.cookies['___Secure-Fgp'] === payload.userFingerprint) {
    //   return res.status(401).send('unauthorized');
    // }
    next();
  } catch (e) {
    return res.status(401).send(e.message);
  }
}

app.get('/tasks', authChecks, (req, res) => {
  const queryCompleted = req.query.completed;
  const filteredTasks = tasks.filter((task) => (
    task.ownerId == req.authenticatedId
  )).filter((task) => {
    if (queryCompleted === 'true') {
      return task.completed;
    }

    if (queryCompleted === 'false') {
      const completed = task.completed || false
      return !completed;
    }

    return true;
  }).map(({id, name, completed}) => ({id, name, completed}));

  res.json(filteredTasks);
});

app.post('/tasks', authChecks, (req, res) => {
  const { name } = req.body;
  const id = ++taskSequenceId;
  tasks = [...tasks, { id, name, ownerId: req.authenticatedId }];
  res.status(201).send('created');
});

app.put('/tasks/:id', authChecks, (req, res) => {
  const {id, name, completed} = tasks.find((task) => (
    task.id === id.toString() &&
    task.ownerId === req.authenticatedId
  ));

  if (!id) {
    return res.status(404).send('not found');
  }

  return res.json({id, name, completed});
});

app.put('/tasks/:id/completed', authChecks, (req, res) => {
  const paramId = req.params.id;
  const task = tasks.find((task) => (
    task.id === Number(paramId) && task.ownerId === req.authenticatedId
  ));
  if (!task) {
    return req.status(404).send('not found');
  }


  tasks = tasks.map((task) => {
    if (task.id === Number(paramId)) {
      return {...task, completed: true};
    }

    return task;
  })
  return res.status(204).send('no content');
});

app.delete('/tasks/:id/completed', authChecks, (req, res) => {
  const paramId = req.params.id;
  const task = tasks.find((task) => (
    task.id === Number(paramId) && task.ownerId === req.authenticatedId
  ));
  if (!task) {
    return req.status(404).send('not found');
  }

  tasks = tasks.map((task) => {
    if (task.id === Number(paramId)) {
      const {completed, ...taskRest} = task;
      return taskRest;
    }

    return task;
  })
  return res.status(204).send('no content');
});

app.listen(port, () => {
  console.log(`Node Todo listening on port ${port}`);
});