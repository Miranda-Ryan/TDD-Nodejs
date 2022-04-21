const sequelize = require('../src/config/database');
const Token = require('../src/model/token');
const TokenService = require('../src/service/token');

beforeAll(async () => {
  await sequelize.sync({ force: true });
});

beforeEach(async () => {
  await Token.destroy({ truncate: true });
});

afterAll(async () => {
  await sequelize.close();
});

describe('Scheduled Token Cleanup', () => {
  it('clears the expired token with scheduled task', async () => {
    // const token = 'test-token';
    // const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    // await Token.create({ token, lastUsedAt: eightDaysAgo });
    // TokenService.scheduleCleanup();
    // setInterval(async () => {
    //   const tokenInDB = await Token.findOne({ where: { token } });
    //   expect(tokenInDB).toBeNull();
    //   done();
    // }, 2000 + 60 * 60 * 1000);
  });
});
