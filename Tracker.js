/**
 * Created by Wonseok Jung in KETI on 2023-08-03.
 */

const mqtt = require('mqtt');
const {nanoid} = require("nanoid");
const fs = require("fs");
const {exec} = require("child_process");

let rf_mqtt_client = null;
let mqtt_client = null;
const runType_topic = '/Panel/runtype';

let drone_info = {};

try {
    drone_info = JSON.parse(fs.readFileSync('./drone_info.json', 'utf8'));
}
catch (e) {
    console.log('can not find [ ./drone_info.json ] file');
    drone_info.id = "Dione";
    drone_info.approval_gcs = "MUV";
    drone_info.host = "121.137.228.240";
    drone_info.drone = "Drone1";
    drone_info.gcs = "KETI_GCS";
    drone_info.type = "ardupilot";
    drone_info.system_id = 1;
    drone_info.gcs_ip = "192.168.1.150";

    fs.writeFileSync('./drone_info.json', JSON.stringify(drone_info, null, 4), 'utf8');
}

rf_mqtt_connect(drone_info.gcs_ip);  // connect to GCS

mqtt_connect(drone_info.host);

function rf_mqtt_connect(serverip) {
    if (rf_mqtt_client === null) {
        let connectOptions = {
            host: serverip,
            port: 1883,
            protocol: "mqtt",
            keepalive: 10,
            clientId: 'rf_Tracker_' + nanoid(15),
            protocolId: "MQTT",
            protocolVersion: 4,
            clean: true,
            reconnectPeriod: 2 * 1000,
            connectTimeout: 30 * 1000,
            queueQoSZero: false,
            rejectUnauthorized: false
        };

        rf_mqtt_client = mqtt.connect(connectOptions);

        rf_mqtt_client.on('connect', () => {
            console.log('rf_mqtt_client is connected to Drone ( ' + serverip + ' )');

            if (runType_topic !== '') {
                rf_mqtt_client.subscribe(runType_topic);
                console.log('[rf_mqtt_client] runType_topic is subscribed: ' + runType_topic);
            }
        });

        rf_mqtt_client.on('message', (topic, message) => {
            if (topic === runType_topic) {
                // console.log('runType - ' + message.toString());
                let execType = message.toString();
                if (execType === 'RF-LTE' || execType === 'Tracker RF') {
                    exec('pm2 start target_drone_rf.js --name Target_Drone_RF', (error, stdout, stderr) => {
                        console.log('runType - ' + message.toString());
                        if (error) {
                            console.log('error: ' + error);
                        }
                        if (stdout) {
                            console.log('stdout: ' + stdout);
                            rf_mqtt_client.end();
                            rf_mqtt_client = null;
                            mqtt_client.end();
                            mqtt_client = null;
                            exec('pm2 stop Tracker', (error, stdout, stderr) => {
                                console.log('pm2 stop Tracker');
                                if (error) {
                                    console.log('error: ' + error);
                                }
                                if (stdout) {
                                    console.log('stdout: ' + stdout);
                                }
                                if (stderr) {
                                    console.log('stderr: ' + stderr);
                                }
                            });
                        }
                        if (stderr) {
                            console.log('stderr: ' + stderr);
                        }
                    });
                }
                else if (execType === 'Tracker RF-LTE') {
                    exec('pm2 start target_drone_rf_lte.js --name Target_Drone_RF-LTE', (error, stdout, stderr) => {
                        console.log('runType - ' + message.toString());
                        if (error) {
                            console.log('error: ' + error);
                        }
                        if (stdout) {
                            console.log('stdout: ' + stdout);
                            rf_mqtt_client.end();
                            rf_mqtt_client = null;
                            mqtt_client.end();
                            mqtt_client = null;
                            exec('pm2 stop Tracker', (error, stdout, stderr) => {
                                console.log('pm2 stop Tracker');
                                if (error) {
                                    console.log('error: ' + error);
                                }
                                if (stdout) {
                                    console.log('stdout: ' + stdout);
                                }
                                if (stderr) {
                                    console.log('stderr: ' + stderr);
                                }
                            });
                        }
                        if (stderr) {
                            console.log('stderr: ' + stderr);
                        }
                    });
                }
            }
            else {
                console.log('[rf_mqtt_client] Received ' + message.toString() + ' From ' + topic);
            }
        });

        rf_mqtt_client.on('error', (err) => {
            console.log('[rf_mqtt_client] error - ' + err.message);
        });
    }
}

let reconnect_count = 0;

function mqtt_connect(serverip) {
    if (mqtt_client === null) {
        let connectOptions = {
            host: serverip,
            port: 1883,
            protocol: "mqtt",
            keepalive: 10,
            clientId: 'Tracker_' + nanoid(15),
            protocolId: "MQTT",
            protocolVersion: 4,
            clean: true,
            reconnectPeriod: 2 * 1000,
            connectTimeout: 30 * 1000,
            queueQoSZero: false,
            rejectUnauthorized: false
        };

        mqtt_client = mqtt.connect(connectOptions);

        mqtt_client.on('connect', () => {
            console.log('mqtt_client is connected to Drone ( ' + serverip + ' )');

            if (runType_topic !== '') {
                mqtt_client.subscribe(runType_topic);
                console.log('[mqtt_client] runType_topic is subscribed: ' + runType_topic);
            }

            reconnect_count = 0;
        });

        mqtt_client.on('message', (topic, message) => {
            if (topic === runType_topic) {
                // console.log('runType - ' + message.toString());
                let execType = message.toString();
                if (execType === 'RF-LTE' || execType === 'Tracker RF') {
                    exec('pm2 start target_drone_rf.js --name Target_Drone_RF', (error, stdout, stderr) => {
                        console.log('runType - ' + message.toString());
                        if (error) {
                            console.log('error: ' + error);
                        }
                        if (stdout) {
                            console.log('stdout: ' + stdout);
                            mqtt_client.end();
                            mqtt_client = null;
                            rf_mqtt_client.end();
                            rf_mqtt_client = null;
                            exec('pm2 stop Tracker', (error, stdout, stderr) => {
                                console.log('pm2 stop Tracker');
                                if (error) {
                                    console.log('error: ' + error);
                                }
                                if (stdout) {
                                    console.log('stdout: ' + stdout);
                                }
                                if (stderr) {
                                    console.log('stderr: ' + stderr);
                                }
                            });
                        }
                        if (stderr) {
                            console.log('stderr: ' + stderr);
                        }
                    });
                }
                else if (execType === 'Tracker RF-LTE') {
                    exec('pm2 start target_drone_rf_lte.js --name Target_Drone_RF-LTE', (error, stdout, stderr) => {
                        console.log('runType - ' + message.toString());
                        if (error) {
                            console.log('error: ' + error);
                        }
                        if (stdout) {
                            console.log('stdout: ' + stdout);
                            mqtt_client.end();
                            mqtt_client = null;
                            rf_mqtt_client.end();
                            rf_mqtt_client = null;
                            exec('pm2 stop Tracker', (error, stdout, stderr) => {
                                console.log('pm2 stop Tracker');
                                if (error) {
                                    console.log('error: ' + error);
                                }
                                if (stdout) {
                                    console.log('stdout: ' + stdout);
                                }
                                if (stderr) {
                                    console.log('stderr: ' + stderr);
                                }
                            });
                        }
                        if (stderr) {
                            console.log('stderr: ' + stderr);
                        }
                    });
                }
            }
            else {
                console.log('[mqtt_client] Received ' + message.toString() + ' From ' + topic);
            }
        });

        mqtt_client.on('error', (err) => {
            console.log('[mqtt_client] error - ' + err.message);
        });

        mqtt_client.on('reconnect', () => {
            console.log('[mqtt_client] reconnect');
            reconnect_count += 1;
        });
        mqtt_client.on('disconnect', (packet) => {
            console.log('[mqtt_client] disconnect', packet);
        });
        mqtt_client.on('close', () => {
            console.log('[mqtt_client] close');
            if (reconnect_count > 5) {
                console.log('reconnect Timeout...' + reconnect_count);
                mqtt_client.end();
                reconnect_count = 0;
                mqtt_client = null;
                setTimeout(mqtt_connect, 1000, serverip);
            }
        });
        mqtt_client.on('disconnect', (packet) => {
            console.log('[mqtt_client] disconnect', packet);
        });
        mqtt_client.on('offline', () => {
            console.log('[mqtt_client] offline');
        });
        mqtt_client.on('end', () => {
            console.log('[mqtt_client] end');
        });
        mqtt_client.on('packetreceive', (packet) => {
            console.log('[mqtt_client] packetreceive', packet);
        });
    }
}
