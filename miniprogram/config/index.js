/**
 * 环境配置
 *
 * useMock = true：所有接口走 utils/mock-server.js，不依赖后端、AppID 或域名，
 *                 可直接在微信开发者工具里跑通完整演示闭环。
 * useMock = false：走真实后端，需要在开发者工具中勾选“不校验合法域名”
 *                  或把 baseUrl 换成已备案的 HTTPS 域名。
 */
module.exports = {
  version: '0.1.0',
  useMock: true,
  baseUrl: 'http://127.0.0.1:8080/api'
};
