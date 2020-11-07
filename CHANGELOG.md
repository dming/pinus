# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [1.4.3](https://github.com/node-pinus/pinus/compare/v1.4.3-alpha.0...v1.4.3) (2020-11-07)

**Note:** Version bump only for package pinus-workspaces







#### 1.4.2

修复web-server  更新express依赖出现的`configure`问题。
fix  #118  #119
回退 web-server express版本
fix pinus-cli lost dependency.



#### 1.4.1
try fix [#63](https://github.com/node-pinus/pinus/issues/65)  运行目录问题，先与pomelo的代码行为保持一致。

添加 error handler 和 globalfilter示例 [examples/websocket-chat-ts-run/game-server/app.ts](examples/websocket-chat-ts-run/game-server/app.ts)

修复 因为修复  [#110](https://github.com/node-pinus/pinus/issues/110) 导致的 所有日志级别都变为INFO的问题。 

#### 1.4.0

更新所有依赖库版本，并修复编译错误。
typescript 版本 3.7.2

fix [#110](https://github.com/node-pinus/pinus/issues/110)  pinus-logger 的logger对象换成原始的 log4js 对象。

#### 1.3.14

fix [#104](https://github.com/node-pinus/pinus/issues/104)
