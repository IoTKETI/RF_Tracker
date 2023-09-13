/**
 * Created by Wonseok Jung in KETI on 2023-04-26.
 */

const {exec} = require("child_process");
const os = require("os");
const mqtt = require('mqtt');
const {nanoid} = require('nanoid');

const fs = require("fs");

const rfPort = 'eth0'; // Set to eth1 if using Crow-Cube, and set to eth0 if using Crow-D.

let tr_mqtt_client = null;
let tr_pub_ready_topic = '/ip/ready';
let tr_sub_change_ip_topic = '/ip/change';

let curIP = '';

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

setIPandRoute(drone_info.gcs_ip);

tr_mqtt_connect('localhost');  // connect to GCS

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

            if (tr_sub_change_ip_topic !== '') {
                tr_mqtt_client.subscribe(tr_sub_change_ip_topic, () => {
                    console.log('[tr_mqtt_client] tr_sub_change_ip_topic is subscribed -> ', tr_sub_change_ip_topic);
                });
            }
        });

        tr_mqtt_client.on('message', (topic, message) => {
            if (topic === tr_sub_change_ip_topic) {
                console.log(message.toString());
                let host_arr = curIP.split('.');

                exec('sudo route delete -net ' + host_arr[0] + '.' + host_arr[1] + '.' + host_arr[2] + '.0 netmask 255.255.255.0 gw ' + curIP, (error, stdout, stderr) => {
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
                    setIPandRoute(message.toString());
                });
            }
            else {
                console.log('[tr_mqtt_client] Received ' + message.toString() + ' From ' + topic);
            }
        });

        tr_mqtt_client.on('error', (err) => {
            console.log('[tr_mqtt_client] error - ' + err.message);
        });
    }
}

function setIPandRoute(host) {
    let host_arr = host.split('.');
    host_arr[3] = '120';
    curIP = host_arr.join('.');

    let networkInterfaces = os.networkInterfaces();
    if (networkInterfaces.hasOwnProperty(rfPort)) {
        if (networkInterfaces[rfPort][0].family === 'IPv4') {
            if (networkInterfaces[rfPort][0].address !== curIP) {
                // set static ip
                exec('sudo ifconfig ' + rfPort + ' ' + curIP, (error, stdout, stderr) => {
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
                    exec('sudo route add -net ' + host_arr[0] + '.' + host_arr[1] + '.' + host_arr[2] + '.0 netmask 255.255.255.0 gw ' + curIP, (error, stdout, stderr) => {
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
                fs.writeFileSync('./readyIP.json', JSON.stringify(IPready, null, 4), 'utf8');
                // set route
                exec('sudo route add -net ' + host_arr[0] + '.' + host_arr[1] + '.' + host_arr[2] + '.0 netmask 255.255.255.0 gw ' + curIP, (error, stdout, stderr) => {
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
                        }
                        if (stderr) {
                            console.error(`stderr: ${stderr}`);
                        }
                    });
                });
            }
        }
        else {
            setTimeout(setIPandRoute, 500, curIP);
        }
    }
    else {
        setTimeout(setIPandRoute, 500, curIP);
    }
}
