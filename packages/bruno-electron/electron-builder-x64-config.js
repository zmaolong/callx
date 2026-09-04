const baseConfig = require('./electron-builder-config');

module.exports = {
  ...baseConfig,
  win: {
    ...baseConfig.win,
    target: [{ target: 'nsis', arch: ['x64'] }]
  }
};
