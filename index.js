const app = require('./src/app');
const sequelize = require('./src/config/database');

sequelize.sync();

app.listen(4000, () => {
  console.log('Server is running on port 4000');
});
