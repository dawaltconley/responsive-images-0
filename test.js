const { spawn } = require('child_process');
const { task } = require('./index.js');

const eachLine = (buffer, callback) => buffer.toString().split('\n').filter(s => s).forEach(callback)
let build = spawn('npx', [ '@11ty/eleventy', ]);
build.stdout.on('data', data => eachLine(data, l => console.log(l)))
build.stderr.on('data', data => eachLine(data, l => console.error(l)))
build.on('close', () => task());
