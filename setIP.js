/**
 * Created by Wonseok Jung in KETI on 2023-04-26.
 */

const {exec} = require("child_process");
const os = require("os");
const mqtt = require('mqtt');
const {nanoid} = require('nanoid');

const fs = require("fs");

const rfPort = 'eth0';

let tr_mqtt_client = null;
let local_pub_ready_topic = '/ip/ready';

let drone_info = {};
try {
    drone_info = JSON.parse(fs.readFileSync('./drone_info.json', 'utf8'));
}
catch (e) {
    console.log('can not find [ ./drone_info.json ] file');

    drone_info.id = "Dione";
    drone_info.approval_gcs = "MUV";
    drone_info.host = "gcs.iotocean.org";
    drone_info.drone = "Drone1";
    drone_info.gcs = "KETI_GCS";
    drone_info.type = "ardupilot";
    drone_info.system_id = 1;
    drone_info.gcs_ip = "192.168.1.150";

    fs.writeFileSync('./drone_info.json', JSON.stringify(drone_info, null, 4), 'utf8');
}

let IPready = {"status": "not ready"};
fs.writeFileSync('./readyIP.json', JSON.stringify(IPready, null, 4), 'utf8');

let host_arr = drone_info.gcs_ip.split('.');
host_arr[3] = parseInt(drone_info.system_id) - 2;
let tr_ip = host_arr.join('.');

tr_mqtt_connect('localhost');

function tr_mqtt_connect(serverip) {
    if (!tr_mqtt_client) {
        let connectOptions = {
            host: serverip,
            port: 1883,
            protocol: "mqtt",
            keepalive: 60,
            clientId: 'SET_IP_' + nanoid(15),
            protocolId: "MQTT",
            protocolVersion: 4,
            clean: true,
            reconnectPeriod: 2 * 1000,
            connectTimeout: 30 * 1000,
            queueQoSZero: false,
            rejectUnauthorized: false
        }

        tr_mqtt_client = mqtt.connect(connectOptions);

        tr_mqtt_client.on('connect', () => {
            console.log('tr_mqtt_client is connected to Drone( ' + serverip + ' )');

            setIPandRoute(tr_ip);
        });

        tr_mqtt_client.on('message', (topic, message) => {
            console.log('[tr_mqtt_client] Received ' + message.toString() + ' From ' + topic);
        });

        tr_mqtt_client.on('error', (err) => {
            console.log('[tr_mqtt_client] error - ' + err.message);
        });
    }
}

function setIPandRoute(host) {
    let networkInterfaces = os.networkInterfaces();
    if (networkInterfaces.hasOwnProperty(rfPort)) {
        for (let idx in networkInterfaces[rfPort]) {
            if (networkInterfaces[rfPort][idx].family === 'IPv4') {
                if (networkInterfaces[rfPort][idx].address !== host) {
                    // set static ip
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
                        // console.log(os.networkInterfaces());
                        // set route
                        exec('sudo route add -net ' + host_arr[0] + '.' + host_arr[1] + '.' + host_arr[2] + '.0 netmask 255.255.255.0 gw ' + host, (error, stdout, stderr) => {
                            if (error) {
                                console.error(`[error] in routing table setting : ${error}`);
                                return;
                            }
                            if (stdout) {
                                console.log(`stdout: ${stdout}`);
                            }
                            if (stderr) {
                                console.error(`stderr: ${stderr}`);
                            }
                            exec('route', (error, stdout, stderr) => {
                                if (error) {
                                    console.error(`[error] in routing table setting : ${error}`);
                                    return;
                                }
                                if (stdout) {
                                    console.log(`stdout: ${stdout}`);
                                    if (tr_mqtt_client) {
                                        tr_mqtt_client.publish(local_pub_ready_topic, 'ready', () => {
                                            console.log('send ready message to localhost(' + local_pub_ready_topic + ')-', 'ready');
                                        });
                                        IPready.status = 'ready';
                                        fs.writeFileSync('../readyIP.json', JSON.stringify(IPready, null, 4), 'utf8');
                                        tr_mqtt_client.end(() => {
                                            console.log('Finish IP setting');
                                        });
                                    }
                                }
                                if (stderr) {
                                    console.error(`stderr: ${stderr}`);
                                }
                            });
                        });
                    });
                }
                else {
                    IPready.status = 'ready';
                    fs.writeFileSync('../readyIP.json', JSON.stringify(IPready, null, 4), 'utf8');
                    // set route
                    exec('sudo route add -net ' + host_arr[0] + '.' + host_arr[1] + '.' + host_arr[2] + '.0 netmask 255.255.255.0 gw ' + host, (error, stdout, stderr) => {
                        if (error) {
                            console.error(`[error] in routing table setting : ${error}`);
                            return;
                        }
                        if (stdout) {
                            console.log(`stdout: ${stdout}`);
                        }
                        if (stderr) {
                            console.error(`stderr: ${stderr}`);
                        }
                        exec('route', (error, stdout, stderr) => {
                            if (error) {
                                console.error(`[error] in routing table setting : ${error}`);
                                return;
                            }
                            if (stdout) {
                                console.log(`stdout: ${stdout}`);
                                if (tr_mqtt_client) {
                                    tr_mqtt_client.publish(local_pub_ready_topic, 'ready', () => {
                                        console.log('send ready message to localhost(' + local_pub_ready_topic + ')-', 'ready');
                                    });
                                }
                                IPready.status = 'ready';
                                fs.writeFileSync('../readyIP.json', JSON.stringify(IPready, null, 4), 'utf8');
                                tr_mqtt_client.end(() => {
                                    console.log('Finish IP setting');
                                });
                            }
                            if (stderr) {
                                console.error(`stderr: ${stderr}`);
                            }
                        });
                    });
                }
            }
            else {
                setTimeout(setIPandRoute, 500, host);
            }
        }
    }
    else {
        setTimeout(setIPandRoute, 500, host);
    }
}
