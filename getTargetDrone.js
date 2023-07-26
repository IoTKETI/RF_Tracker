const mqtt = require('mqtt');
const { nanoid } = require("nanoid");
const fs = require('fs');

let drone_info = {};
try {
    drone_info = JSON.parse(fs.readFileSync('drone_info.json', 'utf8'));
} catch (e) {
    console.log('can not find [ drone_info.json ] file');
    drone_info.host = "gcs.iotocean.org";
    drone_info.drone = "KETI_Simul_1";
    drone_info.gcs = "KETI_GCS";
    drone_info.type = "ardupilot";
    drone_info.system_id = 105;
    drone_info.gcs_ip = "192.168.1.150";

    fs.writeFileSync('./drone_info.json', JSON.stringify(drone_info, null, 4), 'utf8');
}

let local_mqtt_host = '127.0.0.1';
let localmqtt = null;

let gcs_mqtt_host = drone_info.gcs_ip;
let gcs_mqtt = null;
// let gcs_mqtt_message = '';

let sub_drone_data_topic = '/RF/TELE_HUB/drone';
// let sub_drone_data_topic = '/gcs/TELE_HUB/drone/rf/' + drone_info.drone;
//let sub_drone_data_topic = '/Mobius/UMACAIR/Drone_Data/' + drone_info.drone;
let sub_pan_motor_position_topic = '/Ant_Tracker/Motor_Pan';
let sub_tilt_motor_position_topic = '/Ant_Tracker/Motor_Tilt';

let pub_drone_data_topic = '/RF/TELE_HUB/drone';
let motor_control_topic = '/Ant_Tracker/Control';
let motor_altitude_topic = '/Ant_Tracker/Altitude';

//------------- local mqtt connect ------------------
function local_mqtt_connect(host) {
    let connectOptions = {
        host: host,
        port: 1883,
        protocol: "mqtt",
        keepalive: 10,
        clientId: 'local_' + nanoid(15),
        protocolId: "MQTT",
        protocolVersion: 4,
        clean: true,
        reconnectPeriod: 2000,
        connectTimeout: 2000,
        rejectUnauthorized: false
    }

    localmqtt = mqtt.connect(connectOptions);

    localmqtt.on('connect', function () {
        //localmqtt.subscribe(sub_pan_motor_position_topic + '/#', () => {
            // console.log('[pan] pan status subscribed -> ', sub_pan_motor_position_topic);
        //});
        //localmqtt.subscribe(sub_tilt_motor_position_topic + '/#', () => {
            // console.log('[tilt] tilt status subscribed -> ', sub_tilt_motor_position_topic);
        //});
        
        localmqtt.publish('/Ant_Tracker/Control', 'run');
    });

    localmqtt.on('message', function (topic, message) {
        // console.log('[motor] topic, message => ', topic, message.toString());
        if (topic === sub_pan_motor_position_topic) {
            try {
                gcs_mqtt.publish(sub_pan_motor_position_topic, message.toString(), () => {
                    // console.log('send target drone data: ', pub_drone_data_topic, message);
                });
            } catch {
            }
        } else if (topic === sub_tilt_motor_position_topic) {
            try {
                gcs_mqtt.publish(sub_tilt_motor_position_topic, message.toString(), () => {
                    // console.log('send target drone data: ', pub_drone_data_topic, message);
                });
            } catch {
            }
        }

    });

    localmqtt.on('error', function (err) {
        console.log('[tilt] local mqtt connect error ' + err.message);
        localmqtt = null;
        setTimeout(local_mqtt_connect, 1000, local_mqtt_host);
    });
}
//---------------------------------------------------

//------------- gcs mqtt connect ------------------
function gcs_mqtt_connect(host) {
    let connectOptions = {
        host: host,
        port: 1883,
        protocol: "mqtt",
        keepalive: 10,
        clientId: 'sitl_' + nanoid(15),
        protocolId: "MQTT",
        protocolVersion: 4,
        clean: true,
        reconnectPeriod: 2000,
        connectTimeout: 2000,
        rejectUnauthorized: false
    }

    gcs_mqtt = mqtt.connect(connectOptions);

    gcs_mqtt.on('connect', function () {
        gcs_mqtt.subscribe(sub_drone_data_topic + '/#', () => {
            console.log('[gcs] gcs_mqtt subscribed -> ', sub_drone_data_topic);
        });
        gcs_mqtt.subscribe(motor_control_topic + '/#', () => {
            console.log('[gcs] gcs_mqtt subscribed -> ', motor_control_topic);
        });
        gcs_mqtt.subscribe(motor_altitude_topic + '/#', () => {
            console.log('[gcs] gcs_mqtt subscribed -> ', motor_altitude_topic);
        });
    });

    gcs_mqtt.on('message', function (topic, message) {
        //console.log('[gcs] topic, message => ', topic, message.toString('hex'));

        if (topic.includes(sub_drone_data_topic)) { // 드론데이터 수신
            localmqtt_message = message.toString('hex');
            // console.log("Client1 topic => " + topic);
            // console.log("Client1 message => " + drone_message);

            try {
                let ver = localmqtt_message.substring(0, 2);
                let sysid = '';
                let msgid = '';
                let base_offset = 0;

                if (ver == 'fd') {//MAV ver.1
                    sysid = localmqtt_message.substring(10, 12).toLowerCase();
                    msgid = localmqtt_message.substring(18, 20) + localmqtt_message.substring(16, 18) + localmqtt_message.substring(14, 16);
                    base_offset = 20;
                } else { //MAV ver.2
                    sysid = localmqtt_message.substring(6, 8).toLowerCase();
                    msgid = localmqtt_message.substring(10, 12).toLowerCase();
                    base_offset = 12;
                }

                let sys_id = parseInt(sysid, 16);
                let msg_id = parseInt(msgid, 16);

                if (msg_id === 33) { // MAVLINK_MSG_ID_GLOBAL_POSITION_INT
                    var time_boot_ms = localmqtt_message.substring(base_offset, base_offset + 8).toLowerCase()
                    base_offset += 8
                    let lat = localmqtt_message.substring(base_offset, base_offset + 8).toLowerCase().toString();
                    base_offset += 8;
                    let lon = localmqtt_message.substring(base_offset, base_offset + 8).toLowerCase();
                    base_offset += 8;
                    let alt = localmqtt_message.substring(base_offset, base_offset + 8).toLowerCase();
                    base_offset += 8;
                    let relative_alt = localmqtt_message.substring(base_offset, base_offset + 8).toLowerCase();

                    target_latitude = Buffer.from(lat, 'hex').readInt32LE(0).toString() / 10000000;
                    target_longitude = Buffer.from(lon, 'hex').readInt32LE(0).toString() / 10000000;
                    target_altitude = Buffer.from(alt, 'hex').readInt32LE(0).toString() / 1000;
                    target_relative_altitude = Buffer.from(relative_alt, 'hex').readInt32LE(0).toString() / 1000;

                    // console.log('target_latitude, target_longitude, target_altitude, target_relative_altitude', target_latitude, target_longitude, target_altitude, target_relative_altitude);

                    if(run_flag === 'go') {
                        target_angle = calcTargetTiltAngle(target_latitude, target_longitude, target_relative_altitude);
                        // console.log('myPitch, target_angle', myPitch, target_angle);

                        if (Math.abs(target_angle - myPitch) > 10) {
                            p_step = 0.02;
                        } else if (Math.abs(target_angle - myPitch) > 5) {
                            p_step = 0.01;
                        } else if (Math.abs(target_angle - myPitch) > 3) {
                            p_step = 0.005;
                        } else {
                            p_step = 0.001;
                        }

                        if (myPitch !== target_angle) {
                            cw = target_angle - myPitch;
                            if (cw < 0) {
                                cw = cw + 360;
                            }
                            ccw = 360 - cw;

                            if (cw < ccw) {
                                p_in = p_in + p_step;
                            } else if (cw > ccw) {
                                p_in = p_in - p_step;
                            } else {
                                p_in = p_in;
                            }
                        }
                        p_step = 0.02;
                    }
                }
            }
            catch (e) {
                console.log('[tilt] local mqtt connect Error', e);
            }
        }
        else if (topic === motor_control_topic) {
            try {
                localmqtt.publish(motor_control_topic, message.toString(), () => {
                    // console.log('send motor control message: ', motor_control_topic, message.toString());
                });
            } catch {
            }
        } else if (topic === motor_altitude_topic) {
            try {
                localmqtt.publish(motor_altitude_topic, message.toString(), () => {
                    // console.log('send motor control message: ', motor_control_topic, message.toString());
                });
            } catch {
            }
        }
    });

    gcs_mqtt.on('error', function (err) {
        console.log('[tilt] sitl mqtt connect error ' + err.message);
        gcs_mqtt = null;
        setTimeout(gcs_mqtt_connect, 1000, gcs_mqtt_host);
    });
}
//---------------------------------------------------

local_mqtt_connect('127.0.0.1')
//gcs_mqtt_connect(gcs_mqtt_host);




