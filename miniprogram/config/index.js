/**
 * 环境配置
 *
 * baseUrl 为后端接口根地址，所有请求经 utils/request.js 统一发出。
 *
 * 联调说明：
 * 1. 当前为 HTTP + 局域网 IP，开发者工具需勾选「不校验合法域名」；
 * 2. 真机预览/体验版访问局域网地址时，需打开「开发调试」；
 * 3. 正式发布前替换为已备案的 HTTPS 域名，并在小程序后台配置 request 合法域名。
 */
module.exports = {
  version: '0.3.0',
  baseUrl: 'http://10.30.96.49:8080/api'
};
