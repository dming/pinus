/*!
 * Pomelo -- consoleModule serverStop stop/kill
 * Copyright(c) 2012 fantasyni <fantasyni@163.com>
 * MIT Licensed
 */
import { getLogger } from 'pinus-logger';
 var logger = getLogger('pinus', __filename);
import * as countDownLatch from '../util/countDownLatch';
import * as utils from '../util/utils';
import * as Constants from '../util/constants';
import * as starter from '../master/starter';
import { exec } from 'child_process';
import { Application } from '../application';
import { IModule, MonitorCallback, MasterAgent, MasterCallback } from 'pinus-admin';
import { MonitorAgent } from 'pinus-admin';
import { ServerInfo } from '../util/constants';

export interface ConsoleModuleOptions
{
    app ?: Application;

}

export class ConsoleModule implements IModule
{
    app: Application;

    static moduleId = '__console__';

    constructor(opts : ConsoleModuleOptions)
    {
        opts = opts || {};
        this.app = opts.app;
    };

    monitorHandler(agent: MonitorAgent, msg: any, cb: MonitorCallback)
    {
        var serverId = agent.id;
        switch (msg.signal)
        {
            case 'stop':
                if (agent.type === Constants.RESERVED.MASTER)
                {
                    return;
                }
                this.app.stop(true);
                break;
            case 'list':
                var serverType = agent.type;
                var pid = process.pid;
                var heapUsed = (process.memoryUsage().heapUsed / (1024 * 1024)).toFixed(2);
                var rss = (process.memoryUsage().rss / (1024 * 1024)).toFixed(2);
                var heapTotal = (process.memoryUsage().heapTotal / (1024 * 1024)).toFixed(2);
                var uptime = (process.uptime() / 60).toFixed(2);
                utils.invokeCallback(cb, {
                    serverId: serverId,
                    body: { serverId: serverId, serverType: serverType, pid: pid, rss: rss, heapTotal: heapTotal, heapUsed: heapUsed, uptime: uptime }
                });
                break;
            case 'kill':
                utils.invokeCallback(cb, serverId);
                if (agent.type !== 'master')
                {
                    setTimeout(function ()
                    {
                        process.exit(-1);
                    }, Constants.TIME.TIME_WAIT_MONITOR_KILL);
                }
                break;
            case 'addCron':
                this.app.addCrons([msg.cron]);
                break;
            case 'removeCron':
                this.app.removeCrons([msg.cron]);
                break;
            case 'blacklist':
                if (this.app.isFrontend())
                {
                    var connector = this.app.components.__connector__;
                    connector.blacklist = connector.blacklist.concat(msg.blacklist);
                }
                break;
            case 'restart':
                if (agent.type === Constants.RESERVED.MASTER)
                {
                    return;
                }
                var self = this;
                var server = this.app.get(Constants.RESERVED.CURRENT_SERVER);
                utils.invokeCallback(cb, server);
                process.nextTick(function ()
                {
                    self.app.stop(true);
                });
                break;
            default:
                logger.error('receive error signal: %j', msg);
                break;
        }
    };

    clientHandler(agent: MasterAgent, msg: any, cb: MasterCallback)
    {
        var app = this.app;
        switch (msg.signal)
        {
            case 'kill':
                kill(app, agent, msg, cb);
                break;
            case 'stop':
                stop(app, agent, msg, cb);
                break;
            case 'list':
                list(app, agent, msg, cb);
                break;
            case 'add':
                add(app, agent, msg, cb);
                break;
            case 'addCron':
                addCron(app, agent, msg, cb);
                break;
            case 'removeCron':
                removeCron(app, agent, msg, cb);
                break;
            case 'blacklist':
                blacklist(app, agent, msg, cb);
                break;
            case 'restart':
                restart(app, agent, msg, cb);
                break;
            default:
                utils.invokeCallback(cb, new Error('The command cannot be recognized, please check.'), null);
                break;
        }
    };
}
var kill = function (app : Application, agent : MasterAgent, msg : any, cb : MasterCallback)
{
    var sid, record;
    var serverIds : string[] = [];
    var count = utils.size(agent.idMap);
    var latch = countDownLatch.createCountDownLatch(count, { timeout: Constants.TIME.TIME_WAIT_MASTER_KILL }, function (isTimeout)
    {
        if (!isTimeout)
        {
            utils.invokeCallback(cb, null, { code: 'ok' });
        } else
        {
            utils.invokeCallback(cb, null, { code: 'remained', serverIds: serverIds });
        }
        setTimeout(function ()
        {
            process.exit(-1);
        }, Constants.TIME.TIME_WAIT_MONITOR_KILL);
    });

    var agentRequestCallback = function (msg : string)
    {
        for (var i = 0; i < serverIds.length; ++i)
        {
            if (serverIds[i] === msg)
            {
                serverIds.splice(i, 1);
                latch.done();
                break;
            }
        }
    };

    for (sid in agent.idMap)
    {
        record = agent.idMap[sid];
        serverIds.push(record.id);
        agent.request(record.id, ConsoleModule.moduleId, { signal: msg.signal }, agentRequestCallback);
    }
};

var stop = function (app : Application, agent : MasterAgent, msg : any, cb : MasterCallback)
{
    var serverIds = msg.ids;
    if (!!serverIds.length)
    {
        var servers = app.getServers();
        app.set(Constants.RESERVED.STOP_SERVERS, serverIds);
        for (var i = 0; i < serverIds.length; i++)
        {
            var serverId = serverIds[i];
            if (!servers[serverId])
            {
                utils.invokeCallback(cb, new Error('Cannot find the server to stop.'), null);
            } else
            {
                agent.notifyById(serverId, ConsoleModule.moduleId, { signal: msg.signal });
            }
        }
        utils.invokeCallback(cb, null, { status: "part" });
    } else
    {
        var servers = app.getServers();
        var serverIds : any = [];
        for (var key in servers)
        {
            serverIds.push(key)
        }
        app.set(Constants.RESERVED.STOP_SERVERS, serverIds);
        agent.notifyAll(ConsoleModule.moduleId, { signal: msg.signal });
        setTimeout(function ()
        {
            app.stop(true);
            utils.invokeCallback(cb, null, { status: "all" });
        }, Constants.TIME.TIME_WAIT_STOP);
    }
};

var restart = function (app : Application, agent : MasterAgent, msg : any, cb : MasterCallback)
{
    var successFlag : boolean;
    var successIds : string[] = [];
    var serverIds = msg.ids;
    var type = msg.type;
    var servers;
    if (!serverIds.length && !!type)
    {
        servers = app.getServersByType(type);
        if (!servers)
        {
            utils.invokeCallback(cb, new Error('restart servers with unknown server type: ' + type));
            return;
        }
        for (var i = 0; i < servers.length; i++)
        {
            serverIds.push(servers[i].id);
        }
    } else if (!serverIds.length)
    {
        servers = app.getServers();
        for (var key in servers)
        {
            serverIds.push(key);
        }
    }
    var count = serverIds.length;
    var latch = countDownLatch.createCountDownLatch(count, { timeout: Constants.TIME.TIME_WAIT_COUNTDOWN }, function ()
    {
        if (!successFlag)
        {
            utils.invokeCallback(cb, new Error('all servers start failed.'));
            return;
        }
        utils.invokeCallback(cb, null, utils.arrayDiff(serverIds, successIds));
    });

    var request = function (id : string)
    {
        return (function ()
        {
            agent.request(id, ConsoleModule.moduleId, { signal: msg.signal }, function (msg)
            {
                if (!utils.size(msg))
                {
                    latch.done();
                    return;
                }
                setTimeout(function ()
                {
                    runServer(app, msg, function (err, status)
                    {
                        if (!!err)
                        {
                            logger.error('restart ' + id + ' failed.');
                        } else
                        {
                            successIds.push(id);
                            successFlag = true;
                        }
                        latch.done();
                    });
                }, Constants.TIME.TIME_WAIT_RESTART);
            });
        })();
    };

    for (var j = 0; j < serverIds.length; j++)
    {
        request(serverIds[j]);
    }
};

var list = function (app : Application, agent : MasterAgent, msg : any, cb : MasterCallback)
{
    var sid, record;
    var serverInfo : any = {};
    var count = utils.size(agent.idMap);
    var latch = countDownLatch.createCountDownLatch(count, { timeout: Constants.TIME.TIME_WAIT_COUNTDOWN }, function ()
    {
        utils.invokeCallback(cb, null, { msg: serverInfo });
    });

    var callback = function (msg : {serverId:string,body:any})
    {
        serverInfo[msg.serverId] = msg.body;
        latch.done();
    };
    for (sid in agent.idMap)
    {
        record = agent.idMap[sid];
        agent.request(record.id, ConsoleModule.moduleId, { signal: msg.signal }, callback);
    }
};

var add = function (app : Application, agent : MasterAgent, msg : any, cb : MasterCallback)
{
    if (checkCluster(msg))
    {
        startCluster(app, msg, cb);
    } else
    {
        startServer(app, msg, cb);
    }
    reset(ServerInfo);
};

var addCron = function  (app : Application, agent : MasterAgent, msg : any, cb : MasterCallback)
{
    var cron = parseArgs(msg, CronInfo, cb);
    sendCronInfo(cron, agent, msg, CronInfo, cb);
};

var removeCron = function  (app : Application, agent : MasterAgent, msg : any, cb : MasterCallback)
{
    var cron = parseArgs(msg, RemoveCron, cb);
    sendCronInfo(cron, agent, msg, RemoveCron, cb);
};

var blacklist = function (app : Application, agent : MasterAgent, msg : any, cb : MasterCallback)
{
    var ips = msg.args;
    for (var i = 0; i < ips.length; i++)
    {
        if (!(new RegExp(/(\d+)\.(\d+)\.(\d+)\.(\d+)/g).test(ips[i])))
        {
            utils.invokeCallback(cb, new Error('blacklist ip: ' + ips[i] + ' is error format.'), null);
            return;
        }
    }
    agent.notifyAll(ConsoleModule.moduleId, { signal: msg.signal, blacklist: msg.args });
    process.nextTick(function ()
    {
        cb(null, { status: "ok" });
    });
};

var checkPort = function (server : ServerInfo, cb : MasterCallback)
{
    if (!server.port && !server.clientPort)
    {
        utils.invokeCallback(cb, 'leisure');
        return;
    }

    var p = server.port || server.clientPort;
    var host = server.host;
    var cmd = 'netstat -tln | grep ';
    if (!utils.isLocal(host))
    {
        cmd = 'ssh ' + host + ' ' + cmd;
    }

    exec(cmd + p, function (err, stdout, stderr)
    {
        if (stdout || stderr)
        {
            utils.invokeCallback(cb, 'busy');
        } else
        {
            p = server.clientPort;
            exec(cmd + p, function (err, stdout, stderr)
            {
                if (stdout || stderr)
                {
                    utils.invokeCallback(cb, 'busy');
                } else
                {
                    utils.invokeCallback(cb, 'leisure');
                }
            });
        }
    });
};

var parseArgs = function (msg : any, info : any, cb : (err?: string | Error, data?: any) => void)
{
    var rs : {[key:string]:string} = {};
    var args = msg.args;
    for (var i = 0; i < args.length; i++)
    {
        if (args[i].indexOf('=') < 0)
        {
            cb(new Error('Error server parameters format.'), null);
            return;
        }
        var pairs = args[i].split('=');
        var key = pairs[0];
        if (!!info[key])
        {
            info[key] = 1;
        }
        rs[pairs[0]] = pairs[1];
    }
    return rs;
};

var sendCronInfo = function (cron : any, agent : MasterAgent, msg : any, info : any, cb : Function)
{
    if (isReady(info) && (cron.serverId || cron.serverType))
    {
        if (!!cron.serverId)
        {
            agent.notifyById(cron.serverId, ConsoleModule.moduleId, { signal: msg.signal, cron: cron });
        } else
        {
            agent.notifyByType(cron.serverType, ConsoleModule.moduleId, { signal: msg.signal, cron: cron });
        }
        process.nextTick(function ()
        {
            cb(null, { status: "ok" });
        });
    } else
    {
        cb(new Error('Miss necessary server parameters.'), null);
    }
    reset(info);
};

var startServer = function (app : Application, msg : any, cb : (err?: Error | string , result?:any)=>void)
{
    var server = parseArgs(msg, ServerInfo, cb);
    if (isReady(ServerInfo))
    {
        runServer(app, server as any, cb);
    } else
    {
        cb(new Error('Miss necessary server parameters.'), null);
    }
};

var runServer = function (app : Application, server : ServerInfo, cb : (err?: Error , result?:any)=>void)
{
    checkPort(server, function (status)
    {
        if (status === 'busy')
        {
            utils.invokeCallback(cb, new Error('Port occupied already, check your server to add.'));
        } else
        {
            starter.run(app, server, function (err)
            {
                if (err)
                {
                    utils.invokeCallback(cb, new Error(String(err)), null);
                    return;
                }
            });
            process.nextTick(function ()
            {
                utils.invokeCallback(cb, null, { status: "ok" });
            });
        }
    });
};

var startCluster = function (app : Application, msg : any, cb : MasterCallback)
{
    var serverMap = {};
    var fails : ServerInfo[] = [];
    var successFlag : boolean;
    var serverInfo = parseArgs(msg, ClusterInfo, cb) as any;
    utils.loadCluster(app, serverInfo, serverMap);
    var count = utils.size(serverMap);
    var latch = countDownLatch.createCountDownLatch(count,  ()=>
    {
        if (!successFlag)
        {
            utils.invokeCallback(cb, new Error('all servers start failed.'));
            return;
        }
        utils.invokeCallback(cb, null, fails);
    });

    var start = function (server : ServerInfo)
    {
        return (function ()
        {
            checkPort(server, function (status)
            {
                if (status === 'busy')
                {
                    fails.push(server);
                    latch.done();
                } else
                {
                    starter.run(app, server, function (err)
                    {
                        if (err)
                        {
                            fails.push(server);
                            latch.done();
                        }
                    });
                    process.nextTick(function ()
                    {
                        successFlag = true;
                        latch.done();
                    });
                }
            });
        })();
    };
    for (var key in serverMap)
    {
        var server = (serverMap as any)[key];
        start(server);
    }
};

var checkCluster = function (msg : any)
{
    var flag = false;
    var args = msg.args;
    for (var i = 0; i < args.length; i++)
    {
        if (utils.startsWith(args[i], Constants.RESERVED.CLUSTER_COUNT))
        {
            flag = true;
        }
    }
    return flag;
};

var isReady = function (info : any)
{
    for (var key in info)
    {
        if (info[key])
        {
            return false;
        }
    }
    return true;
};

var reset = function (info : any)
{
    for (var key in info)
    {
        info[key] = 0;
    }
};

var ServerInfo = {
    host: 0,
    port: 0,
    id: 0,
    serverType: 0
};

var CronInfo = {
    id: 0,
    action: 0,
    time: 0
};

var RemoveCron = {
    id: 0
};

var ClusterInfo = {
    host: 0,
    port: 0,
    clusterCount: 0
};