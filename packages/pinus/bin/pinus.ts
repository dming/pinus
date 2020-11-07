#!/usr/bin/env node

/**
 * Module dependencies.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as program from 'commander';
import { COMMAND_ERROR } from './utils/constants';
import { version } from './utils/utils';
import { isFunction } from 'util';

program.version(version);

program.command('*')
    .action(function () {
        console.log(COMMAND_ERROR);
    });

fs.readdirSync(__dirname + '/commands').forEach(function (filename) {
    if (/\.js$/.test(filename)) {
        let name = filename.substr(0, filename.lastIndexOf('.'));
        let _command = require('./commands/' + name).default;
        if (isFunction(_command)) {
            _command(program);
        }
    }
});

const customCmdsDir = path.resolve(__dirname, "../../../../dist/app/services/gm/modules");
fs.readdirSync(customCmdsDir).forEach(function (filename) {
    if (/\Module.js$/.test(filename)) {
        try {
            let name = filename.substr(0, filename.lastIndexOf('.'));
            const absPath = customCmdsDir + "/" + name;
            let _command = require(absPath).default;
            if (isFunction(_command)) {
                _command(program);
            } else {
                console.log("try to load custom module in path=%s, but _command should be function", absPath);
            }
        } catch (e) {
            console.error("in node_modules/pinus/dist/bin/pinus.js error = \n %j", e);
        }
    }
});

program.parse(process.argv);
