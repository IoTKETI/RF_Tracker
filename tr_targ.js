const mqtt = require('mqtt');
const {nanoid} = require("nanoid");
const fs = require('fs');
const {exec} = require('child_process');

const {mavlink10, MAVLink10Processor} = require('./mavlibrary/mavlink1');
const {mavlink20, MAVLink20Processor} = require('./mavlibrary/mavlink2');

let GcsName = 'KETI_GCS';
let DroneName = 'KETI_Simul_1';

let dr_info_topic = '/Mobius/' + GcsName + '/Drinfo_Data/' + DroneName + '/Panel';

let pn_ctrl_topic = '/Mobius/' + GcsName + '/Ctrl_Data/' + DroneName + '/Panel';
let pn_alt_topic = '/Mobius/' + GcsName + '/Alt_Data/' + DroneName + '/Panel';
let pn_speed_topic = '/Mobius/' + GcsName + '/Speed_Data/' + DroneName + '/Panel';
let pn_offset_topic = '/Mobius/' + GcsName + '/Offset_Data/' + DroneName + '/Panel';

let dr_data_topic = '/Mobius/' + GcsName + '/Drone_Data/' + DroneName + '/#';

let rc_data_topic = '/Mobius/' + GcsName + '/RC_Data/' + DroneName;

let res_data_topic = '/Mobius/' + GcsName + '/RC_Res_Data/' + DroneName;

let tr_data_topic = '/Mobius/' + GcsName + '/Tr_Data/' + DroneName + '/pantilt';

let tr_mqtt_client = null;

let dr_mqtt_client = null;

let mobius_mqtt_client = null;

let my_sortie_name = 'unknown';

let drone_info = {};

let DroneData = {};
let t_id = null;
let disconnected = true;

setTimeout(init, 6000);

function init() {
    try {
        drone_info = JSON.parse(fs.readFileSync('./drone_info.json', 'utf8'));
    }
    catch (e) {
        console.log('can not find [ ./drone_info.json ] file');
        drone_info.id = "Dione";
        drone_info.approval_gcs = "MUV";
        drone_info.host = "121.137.228.240";
        drone_info.drone = "KETI_Simul_1";
        drone_info.gcs = "KETI_GCS";
        drone_info.type = "ardupilot";
        drone_info.system_id = 1;
        drone_info.gcs_ip = "192.168.1.150";

        fs.writeFileSync('./drone_info.json', JSON.stringify(drone_info, null, 4), 'utf8');
    }

    GcsName = drone_info.gcs;
    DroneName = drone_info.drone;

    dr_info_topic = '/Mobius/' + GcsName + '/Drinfo_Data/' + DroneName + '/Panel';

    pn_ctrl_topic = '/Mobius/' + GcsName + '/Ctrl_Data/' + DroneName + '/Panel';
    pn_alt_topic = '/Mobius/' + GcsName + '/Alt_Data/' + DroneName + '/Panel';
    pn_speed_topic = '/Mobius/' + GcsName + '/Speed_Data/' + DroneName + '/Panel';
    pn_offset_topic = '/Mobius/' + GcsName + '/Offset_Data/' + DroneName + '/Panel';

    dr_data_topic = '/Mobius/' + GcsName + '/Drone_Data/' + DroneName + '/#';

    rc_data_topic = '/Mobius/' + GcsName + '/RC_Data/' + DroneName;

    res_data_topic = '/Mobius/' + GcsName + '/RC_Res_Data/' + DroneName;

    tr_data_topic = '/Mobius/' + GcsName + '/Tr_Data/' + DroneName + '/pantilt';

    tr_mqtt_connect('localhost');

    let host_arr = drone_info.gcs_ip.split('.');
    host_arr[3] = parseInt(drone_info.system_id);
    let drone_ip = host_arr.join('.');

    dr_mqtt_connect(drone_ip);

    mobius_mqtt_connect(drone_info.host);
}

function tr_mqtt_connect(serverip) {
    let connectOptions = {
        host: serverip,
        port: 1883,
        protocol: "mqtt",
        keepalive: 10,
        clientId: 'tr_mqtt_' + nanoid(15),
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
        console.log('tr_mqtt_client is connected to ' + serverip);

        if (tr_data_topic !== '') {
            tr_mqtt_client.subscribe(tr_data_topic, () => {
                console.log('[tr_mqtt_client] tr_data_topic is subscribed -> ' + tr_data_topic);
            });
        }
        if (dr_info_topic !== '') {
            tr_mqtt_client.subscribe(dr_info_topic, () => {
                console.log('[tr_mqtt_client] dr_info_topic is subscribed -> ' + dr_info_topic);
            });
        }
    });

    tr_mqtt_client.on('message', (topic, message) => {
        if (topic === dr_info_topic) {
            let prev_ip = drone_info.gcs_ip;
            let host_arr = prev_ip.split('.');
            host_arr[3] = parseInt(drone_info.system_id) - 2;

            drone_info = JSON.parse(message.toString());
            fs.writeFileSync('./drone_info.json', JSON.stringify(drone_info, null, 4), 'utf8');
            exec('sudo route delete -net ' + host_arr[0] + '.' + host_arr[1] + '.' + host_arr[2] + '.0 netmask 255.255.255.0 gw ' + prev_ip, (error, stdout, stderr) => {
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
                exec('pm2 restart all');
            });
        }

        if (topic === tr_data_topic) {
            if (mobius_mqtt_client) {
                mobius_mqtt_client.publish(topic, message, () => {
                    console.log(topic, message.toString());
                });
            }
        }
    });

    tr_mqtt_client.on('error', (err) => {
        console.log('[tr_mqtt_client] error - ' + err.message);
    });
}

function dr_mqtt_connect(serverip) {
    let connectOptions = {
        host: serverip,
        port: 1883,
        protocol: "mqtt",
        keepalive: 10,
        clientId: 'dr_mqtt_' + nanoid(15),
        protocolId: "MQTT",
        protocolVersion: 4,
        clean: true,
        reconnectPeriod: 2 * 1000,
        connectTimeout: 30 * 1000,
        queueQoSZero: false,
        rejectUnauthorized: false
    }

    dr_mqtt_client = mqtt.connect(connectOptions);

    dr_mqtt_client.on('connect', () => {
        console.log('dr_mqtt_client is connected to ' + serverip);

        if (dr_data_topic !== '') {
            dr_mqtt_client.subscribe(dr_data_topic, () => {
                console.log('[dr_mqtt_client] dr_data_topic is subscribed -> ', dr_data_topic);
            });
        }
        if (res_data_topic !== '') {
            dr_mqtt_client.subscribe(res_data_topic, () => {
                console.log('[dr_mqtt_client] res_data_topic is subscribed -> ', res_data_topic);
            });
        }
    });

    dr_mqtt_client.on('message', (topic, message) => {
        let _dr_data_topic = dr_data_topic.replace('/#', '');
        let arr_topic = topic.split('/');
        let _topic = arr_topic.splice(0, arr_topic.length - 1).join('/');

        if (_topic === _dr_data_topic) {
            if (t_id) {
                clearTimeout(t_id);
                disconnected = false;
            }

            t_id = setTimeout(() => {
                disconnected = true;
                t_id = null;
                DroneData = {};
            }, 200);

            let droneData = message.toString('hex');
            let sequence;

            if (droneData.substring(0, 2) === 'fe') {
                sequence = parseInt(droneData.substring(4, 6), 16);
                DroneData[sequence] = droneData;
            }
            else {
                sequence = parseInt(droneData.substring(8, 10), 16);
                DroneData[sequence] = droneData;
            }
            console.log('[RF]', sequence);

            // RF로 받은 드론 데이터를 Mobius에게 LTE로 전달
            if (mobius_mqtt_client) {
                mobius_mqtt_client.publish(topic + '/tr', message);
            }

            tr_message_handler(topic, message);
        }
        else if (topic === res_data_topic) {
            if (mobius_mqtt_client) {
                mobius_mqtt_client.publish(topic + '/tr', message);
            }
        }
    });

    dr_mqtt_client.on('error', (err) => {
        console.log('[dr_mqtt_client] error - ' + err.message);
    });
}

let mavlink = null;

let tr_message_handler = (topic, message) => {
    if (tr_mqtt_client) {
        let result = parseMavFromDrone(message.toString('hex'));

        if (result === mavlink.MAVLINK_MSG_ID_GLOBAL_POSITION_INT) {
            tr_mqtt_client.publish(topic, 'gpi;' + JSON.stringify(global_position_int), () => {
                // console.log('Send MAVLINK_MSG_ID_GLOBAL_POSITION_INT ' + topic);
            });
        }
        else if (result === mavlink.MAVLINK_MSG_ID_HEARTBEAT) {
            tr_mqtt_client.publish(topic, 'hb;' + JSON.stringify(heartbeat), () => {
                // console.log('Send MAVLINK_MSG_ID_HEARTBEAT ' + topic);
            });
        }
    }
}

function mobius_mqtt_connect(serverip) {
    let connectOptions = {
        host: serverip,
        port: 1883,
        protocol: "mqtt",
        keepalive: 10,
        clientId: 'mobius_mqtt_' + nanoid(15),
        protocolId: "MQTT",
        protocolVersion: 4,
        clean: true,
        reconnectPeriod: 2 * 1000,
        connectTimeout: 30 * 1000,
        queueQoSZero: false,
        rejectUnauthorized: false
    }

    mobius_mqtt_client = mqtt.connect(connectOptions);

    mobius_mqtt_client.on('connect', () => {
        console.log('mobius_mqtt_client is connected to ' + serverip);

        mobius_mqtt_client.subscribe(dr_info_topic, () => {
            console.log('[mobius_mqtt_client] dr_info_topic is subscribed -> ', dr_info_topic);
        });

        mobius_mqtt_client.subscribe(dr_data_topic, () => {
            console.log('[mobius_mqtt_client] dr_data_topic is subscribed -> ', dr_data_topic);
        });

        mobius_mqtt_client.subscribe(pn_ctrl_topic, () => {
            console.log('[mobius_mqtt_client] pn_ctrl_topic is subscribed -> ' + pn_ctrl_topic);
        });

        mobius_mqtt_client.subscribe(pn_alt_topic, () => {
            console.log('[mobius_mqtt_client] pn_alt_topic is subscribed -> ' + pn_alt_topic);
        });

        mobius_mqtt_client.subscribe(pn_speed_topic, () => {
            console.log('[mobius_mqtt_client] pn_speed_topic is subscribed -> ' + pn_speed_topic);
        });

        mobius_mqtt_client.subscribe(pn_offset_topic, () => {
            console.log('[mobius_mqtt_client] pn_offset_topic is subscribed -> ' + pn_offset_topic);
        });

        mobius_mqtt_client.subscribe(rc_data_topic, () => {
            console.log('[mobius_mqtt_client] rc_data_topic is subscribed: ' + rc_data_topic);
        });
    });

    mobius_mqtt_client.on('message', (topic, message) => {
        let _dr_data_topic = dr_data_topic.replace('/#', '');
        let arr_topic = topic.split('/');
        let _topic = arr_topic.splice(0, arr_topic.length - 1).join('/');

        if (_topic === _dr_data_topic) {
            let droneData = message.toString('hex');
            let sequence;
            if (droneData.substring(0, 2) === 'fe') {
                sequence = parseInt(droneData.substring(4, 6), 16);
                if (DroneData.hasOwnProperty(sequence)) {
                    delete DroneData[sequence];
                    return;
                }
            }
            else {
                sequence = parseInt(droneData.substring(4, 6), 16);
                if (DroneData.hasOwnProperty(sequence)) {
                    delete DroneData[sequence];
                    return;
                }
            }
            // console.log('[LTE-Drone]', sequence);
            tr_message_handler(topic, message);
        }
        else if (topic === dr_info_topic) {
            let prev_ip = drone_info.gcs_ip;
            let host_arr = prev_ip.split('.');
            host_arr[3] = parseInt(drone_info.system_id) - 2;

            drone_info = JSON.parse(message.toString());
            fs.writeFileSync('./drone_info.json', JSON.stringify(drone_info, null, 4), 'utf8');
            exec('sudo route delete -net ' + host_arr[0] + '.' + host_arr[1] + '.' + host_arr[2] + '.0 netmask 255.255.255.0 gw ' + prev_ip, (error, stdout, stderr) => {
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
                exec('pm2 restart all');
            });
        }
        else if (topic === pn_ctrl_topic) {
            if (tr_mqtt_client) {
                tr_mqtt_client.publish(topic, message);
            }
        }
        else if (topic === pn_alt_topic) {
            if (tr_mqtt_client) {
                tr_mqtt_client.publish(topic, message);
            }
        }
        else if (topic === pn_speed_topic) {
            if (tr_mqtt_client) {
                tr_mqtt_client.publish(topic, message);
            }
        }
        else if (topic === rc_data_topic) {
            if (dr_mqtt_client) {
                dr_mqtt_client.publish(rc_data_topic + '/tr', message, () => {
                    // console.log("send to " + rc_data_topic + " -", message.toString('hex'));
                });
            }
        }
        else if (topic === pn_offset_topic) {
            if (tr_mqtt_client) {
                tr_mqtt_client.publish(topic, message, () => {
                    // console.log("send to " + pn_offset_topic + " -", message.toString());
                });
            }
        }
    });

    mobius_mqtt_client.on('error', (err) => {
        console.log('[mobius_mqtt_client] error - ' + err.message);
    });
}

let flag_base_mode = 0;
let heartbeat = {};
let global_position_int = {};

function parseMavFromDrone(mavPacket) {
    try {
        let ver = mavPacket.substring(0, 2);
        let mavObj = {};

        if (ver === 'fd') {
            let sys_id = parseInt(mavPacket.substring(10, 12), 16);
            let com_id = parseInt(mavPacket.substring(12, 14), 16);
            mavlink = mavlink20;
            const mavParser = new MAVLink20Processor(null/*logger*/, sys_id, com_id);
            mavObj = mavParser.decode(Buffer.from(mavPacket, 'hex'));
        }
        else {
            let sys_id = parseInt(mavPacket.substring(6, 8), 16);
            let com_id = parseInt(mavPacket.substring(8, 10), 16);
            mavlink = mavlink10;
            const mavParser = new MAVLink10Processor(null/*logger*/, sys_id, com_id);
            mavObj = mavParser.decode(Buffer.from(mavPacket, 'hex'));
        }

        if (mavObj._id === mavlink.MAVLINK_MSG_ID_HEARTBEAT) { // #00 : HEARTBEAT
            heartbeat.type = mavObj.type;
            if (heartbeat.type !== mavlink.MAV_TYPE_ADSB) {
                heartbeat.autopilot = mavObj.autopilot;
                heartbeat.base_mode = mavObj.base_mode;
                heartbeat.custom_mode = mavObj.custom_mode;
                heartbeat.system_status = mavObj.system_status;
                heartbeat.mavlink_version = mavObj.mavlink_version;

                let armStatus = (heartbeat.base_mode & 0x80) === 0x80;

                if (armStatus) {
                    flag_base_mode++;
                    if (flag_base_mode === 3) {
                        my_sortie_name = 'arm';
                    }
                }
                else {
                    flag_base_mode = 0;
                    my_sortie_name = 'disarm';
                }
            }

            return mavlink.MAVLINK_MSG_ID_HEARTBEAT;
        }
        else if (mavObj._id === mavlink.MAVLINK_MSG_ID_GLOBAL_POSITION_INT) { // #33
            let _globalpositionint_msg = {};

            _globalpositionint_msg.time_boot_ms = mavObj.time_boot_ms;
            _globalpositionint_msg.lat = mavObj.lat;
            _globalpositionint_msg.lon = mavObj.lon;
            _globalpositionint_msg.alt = mavObj.alt;
            _globalpositionint_msg.relative_alt = mavObj.relative_alt;
            _globalpositionint_msg.vx = mavObj.vx;
            _globalpositionint_msg.vy = mavObj.vy;
            _globalpositionint_msg.vz = mavObj.vz;
            _globalpositionint_msg.hdg = mavObj.hdg;

            let _lat = _globalpositionint_msg.lat / 10000000;
            let _lon = _globalpositionint_msg.lon / 10000000
            if ((33 < _lat && _lat < 43) && ((124 < _lon && _lon < 132))) {
                global_position_int = JSON.parse(JSON.stringify(_globalpositionint_msg));
            }
            else {
                _globalpositionint_msg.lat = global_position_int.lat;
                _globalpositionint_msg.lon = global_position_int.lon;

                global_position_int = JSON.parse(JSON.stringify(_globalpositionint_msg));
            }
            return mavlink.MAVLINK_MSG_ID_GLOBAL_POSITION_INT;
        }

        return -1;
    }
    catch (e) {
        console.log('[parseMavFromDrone Error]', e);
    }
}
