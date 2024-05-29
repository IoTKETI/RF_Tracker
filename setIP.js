/**
 * Created by Wonseok Jung in KETI on 2023-04-26.
 */

const {exec} = require("child_process");
const os = require("os");
const fs = require("fs");

const rfPort = 'eth0';

let drone_info = {};
try {
    drone_info = JSON.parse(fs.readFileSync('./drone_info.json', 'utf8'));
}
catch (e) {
    console.log('can not find [ ./drone_info.json ] file');

    drone_info.id = "Dione";
    drone_info.approval_gcs = "MUV";
    drone_info.host = "gcs.iotocean.org";
    drone_info.drone = "KETI_Drone";
    drone_info.gcs = "KETI_GCS";
    drone_info.type = "ardupilot";
    drone_info.system_id = 250;

    fs.writeFileSync('./drone_info.json', JSON.stringify(drone_info, null, 4), 'utf8');
}

let IPready = {"status": "not ready"};
fs.writeFileSync('./readyIP.json', JSON.stringify(IPready, null, 4), 'utf8');

let status = '';

status = 'setIP';
let tr_ip = '192.168.' + drone_info.system_id + '.' + (parseInt(drone_info.system_id) - 6);
setTimeout(setIPandRoute, 200, tr_ip);

let diffIpCount = 0;

function checkIP(host) {
    let networkInterfaces = os.networkInterfaces();
    if (networkInterfaces.hasOwnProperty(rfPort)) {
        let alreadySet = false;
        let prev_ip;
        let setIP;
        for (let idx in networkInterfaces[rfPort]) {
            if (networkInterfaces[rfPort][idx].family === 'IPv4') {
                if (networkInterfaces[rfPort][idx].address === host) {
                    alreadySet = true;
                    setIP = networkInterfaces[rfPort][idx].address;
                }
                else {
                    prev_ip = networkInterfaces[rfPort][idx].address;
                }
            }
            else {
                console.log('waiting for IPv4');
            }
        }

        if (!alreadySet) {
            if (diffIpCount > 5) {
                status = 'setIP';
                setTimeout(setIPandRoute, 200, host);
                diffIpCount = 0;
            }
            else {
                diffIpCount++;
                setTimeout(checkIP, 1000, host);
            }
        }
        else {
            console.log('already set ' + rfPort + ' IP --> ' + setIP)
            setTimeout(checkIP, 3000, host);
        }
    }
}

function setIPandRoute(host) {
    let host_arr = host.split('.');

    let networkInterfaces = os.networkInterfaces();
    if (networkInterfaces.hasOwnProperty(rfPort)) {
        if (status === 'setIP') {
            let alreadySet = false;
            let prev_ip;
            for (let idx in networkInterfaces[rfPort]) {
                if (networkInterfaces[rfPort][idx].family === 'IPv4') {
                    if (networkInterfaces[rfPort][idx].address === host) {
                        alreadySet = true;
                    }
                    else {
                        prev_ip = networkInterfaces[rfPort][idx].address;
                    }
                }
                else {
                    console.log('waiting for IPv4');
                }
            }

            if (!alreadySet) {
                // set static ip
                console.log('eth0 address different from drone IP --> ' + prev_ip + ' - ' + host);
                exec('sudo ifconfig ' + rfPort + ' ' + host, (error, stdout, stderr) => {
                    if (error) {
                        console.error(`[error] in static ip setting : ${error}`);
                        return;
                    }
                    if (stdout) {
                        console.log(`stdout: ${stdout}`);
                    }
                    if (stderr) {
                        console.error(`stderr: ${stderr}`);
                    }
                    status = 'checkRoutingTable';
                    setTimeout(setIPandRoute, 500, host);
                });
            }
            else {
                console.log('eth0 address same as drone IP --> ' + prev_ip + ' - ' + host);

                status = 'checkRoutingTable';
                setTimeout(setIPandRoute, 500, host);
            }
        }
        else if (status === 'checkRoutingTable') {
            console.log('ip setting successful. then routing table checking');
            exec('route', (error, stdout, stderr) => {
                if (error) {
                    console.error(`[error] Checking the routing table : ${error}`);
                    return;
                }
                if (stdout) {
                    console.log(`stdout: ${stdout}`);
                    let routing_table = stdout.split('\n');

                    let addedRoutingTable = false;

                    routing_table.forEach((routingList) => {
                        if (routingList.includes(rfPort)) {
                            if (routingList.includes(host_arr[0] + '.' + host_arr[1] + '.' + host_arr[2] + '.0')) {
                                addedRoutingTable = true;
                            }
                        }
                    });

                    if (addedRoutingTable) {
                        IPready.status = 'ready';
                        fs.writeFileSync('../readyIP.json', JSON.stringify(IPready, null, 4), 'utf8');
                        status = 'Finish';
                        console.log('Finish IP setting');
                        setTimeout(checkIP, 1000, host);
                    }
                    else {
                        status = 'addedRoutingTable';
                        setTimeout(setIPandRoute, 500, host);
                    }
                }
                if (stderr) {
                    console.error(`stderr: ${stderr}`);
                }
            });
        }
        else if (status === 'addedRoutingTable') {
            // set route
            console.log('ip setting successful. then add route');
            exec('sudo route add -net ' + host_arr[0] + '.' + host_arr[1] + '.' + host_arr[2] + '.0 netmask 255.255.255.0 gw ' + host, (error, stdout, stderr) => {
                if (error) {
                    console.error(`[error] Setting up the routing table : ${error}`);
                }
                if (stdout) {
                    console.log(`stdout: ${stdout}`);
                }
                if (stderr) {
                    console.error(`stderr: ${stderr}`);
                }
                console.log('route addition was successful. then routing table checking');
                status = 'checkRoutingTable';
                setTimeout(setIPandRoute, 500, host);
            });
        }
    }
    else {
        console.log('waiting for ' + rfPort)
        setTimeout(setIPandRoute, 2000, host);
    }
}
