require('dotenv').config();
const express = require('express');
const app = express();
const cors = require('cors');
app.use(cors());

app.use(express.json());

const employeesRouter = require('./routes/employees');
const schedulesRouter = require('./routes/schedules');
const timeclockRouter = require('./routes/timeclock');

app.use('/api/employees', employeesRouter);
app.use('/api/schedules', schedulesRouter);
app.use('/api/timeclock', timeclockRouter);

app.get('/', (req, res) => {
  res.json({ status: 'ok', app: 'Planning HPA' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});


