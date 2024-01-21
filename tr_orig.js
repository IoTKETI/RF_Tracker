const {SerialPort} = require('serialport');
const mqtt = require('mqtt');
const {nanoid} = require('nanoid');
const fs = require("fs");

const {mavlink10, MAVLink10Processor} = require('./mavlibrary/mavlink1');
const {mavlink20, MAVLink20Processor} = require('./mavlibrary/mavlink2');

let mavPortNum = '/dev/ttyAMA0';
let mavBaudrate = '115200';
let mavPort = null;

let drone_info = {};
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

let global_position_int_msg = {};
let gps_raw_int_msg = {};
let attitude_msg = {};

let position_refresh_flag = 0;
let attitude_refresh_flag = 0;

global_position_int_msg.lat = 37.4036621604629;
global_position_int_msg.lon = 127.16176249708046;
global_position_int_msg.alt = 0.0;
global_position_int_msg.relative_alt = 0.0;
global_position_int_msg.hdg = 0.0;

attitude_msg.yaw = 0.0;

let GcsName = drone_info.gcs;
let DroneName = drone_info.drone;

let tr_mqtt_client = null;

let gps_pos_topic = '/Mobius/' + GcsName + '/Pos_Data/GPS';
let gps_att_topic = '/Mobius/' + GcsName + '/Att_Data/GPS';
let gps_raw_topic = '/Mobius/' + GcsName + '/Gps_Data/GPS';
let gps_type_topic = '/Mobius/' + GcsName + '/Type_Data/GPS';

let pn_dinfo_topic = '/Mobius/' + GcsName + '/Drone_Info_Data/Panel';

let pn_offset_topic = '/Mobius/' + GcsName + '/Offset_Data/' + DroneName + '/Panel';

let pn_drone_topic = '/Mobius/' + GcsName + '/Drone_Data/' + DroneName + '/Panel';
let pn_cmd_topic = '/Mobius/' + GcsName + '/TrCmd_Data/' + DroneName + '/Panel';

let ant_type = '';

mavPortOpening();

tr_mqtt_connect('localhost');

function mavPortOpening() {
    if (!mavPort) {
        mavPort = new SerialPort({
            path: mavPortNum,
            baudRate: parseInt(mavBaudrate, 10),
        });
        mavPort.on('open', mavPortOpen);
        mavPort.on('close', mavPortClose);
        mavPort.on('error', mavPortError);
        mavPort.on('data', mavPortData);
    }
    else {
        if (mavPort.isOpen) {
            mavPort.close();
            mavPort = null;
            setTimeout(mavPortOpening, 2000);
        }
        else {
            mavPort.open();
        }
    }
}

function mavPortOpen() {
    console.log('mavPort(' + mavPort.path + '), mavPort rate: ' + mavPort.baudRate + ' open.');

    send_param_get_command();
}

function mavPortClose() {
    console.log('mavPort closed.');

    setTimeout(mavPortOpening, 2000);
}

function mavPortError(error) {
    console.log('[mavPort error]: ' + error.message);

    setTimeout(mavPortOpening, 2000);
}

let mavStrFromDrone = Buffer.from([]);
let mavVersion = 'unknown';
let reqDataStream = false;
let mavPacket = null;
let mavlink = null;
let mav_t_id = null;
let my_system_id = 8;

function mavPortData(data) {
    mavStrFromDrone = Buffer.concat([mavStrFromDrone, data])

    while (Buffer.byteLength(mavStrFromDrone) > 0) {
        const offset = findStartOfPacket(mavStrFromDrone)
        if (offset === null) {
            break
        }

        if (offset > 0) {
            mavStrFromDrone = mavStrFromDrone.slice(offset)
        }

        const Protocol = getPacketProtocol(mavStrFromDrone)

        if (mavStrFromDrone.length < Protocol.PAYLOAD_OFFSET + Protocol.CHECKSUM_LENGTH) {
            break
        }

        const expectedBufferLength = readPacketLength(mavStrFromDrone, Protocol)
        if (mavStrFromDrone.length < expectedBufferLength) {
            break
        }

        const mavBuffer = mavStrFromDrone.slice(0, expectedBufferLength)

        try {
            if (Protocol.NAME === 'MAV_V1') {
                mavVersion = 'v1'
                mavlink = mavlink10;
                const mavParser = new MAVLink10Processor(null/*logger*/, Protocol.SYS_ID, Protocol.COMP_ID);
                mavPacket = mavParser.decode(mavBuffer)
            }
            else if (Protocol.NAME === 'MAV_V2') {
                mavVersion = 'v2'
                mavlink = mavlink20;
                const mavParser = new MAVLink20Processor(null/*logger*/, Protocol.SYS_ID, Protocol.COMP_ID);
                mavPacket = mavParser.decode(mavBuffer)
            }
            // console.log(mavVersion, mavPacket._msgbuf.toString('hex'))

            if (tr_mqtt_client) {
                tr_mqtt_client.publish(pn_drone_topic, mavPacket._msgbuf)
            }
            setTimeout(parseMavFromDrone, 0, mavPacket);

            mavStrFromDrone = mavStrFromDrone.slice(expectedBufferLength)
        }
        catch (e) {
            console.log('[mavParse]', e, '\n', mavStrFromDrone.toString('hex'))
            mavStrFromDrone = mavStrFromDrone.slice(1)
        }

        mav_t_id = setTimeout(() => {
            if (!reqDataStream) {
                setTimeout(send_request_data_stream_command, 1, mavlink.MAV_DATA_STREAM_RAW_SENSORS, 3, 1);
                setTimeout(send_request_data_stream_command, 3, mavlink.MAV_DATA_STREAM_EXTENDED_STATUS, 3, 1);
                setTimeout(send_request_data_stream_command, 5, mavlink.MAV_DATA_STREAM_RC_CHANNELS, 3, 1);
                setTimeout(send_request_data_stream_command, 7, mavlink.MAV_DATA_STREAM_POSITION, 3, 1);
                setTimeout(send_request_data_stream_command, 9, mavlink.MAV_DATA_STREAM_EXTRA1, 3, 1);
                setTimeout(send_request_data_stream_command, 11, mavlink.MAV_DATA_STREAM_EXTRA2, 3, 1);
                setTimeout(send_request_data_stream_command, 13, mavlink.MAV_DATA_STREAM_EXTRA3, 3, 1);

                setTimeout(send_param_get_command, 15, 'BATT_LOW_VOLT', 1);

                reqDataStream = true;
            }
        }, 3 * 1000);
    }
}

function send_request_data_stream_command(req_stream_id, req_message_rate, start_stop) {
    let btn_params = {};
    btn_params.target_system = my_system_id;
    btn_params.target_component = 1;
    btn_params.req_stream_id = req_stream_id;
    btn_params.req_message_rate = req_message_rate;
    btn_params.start_stop = start_stop;

    try {
        let msg = mavlinkGenerateMessage(255, 0xbe, mavlink.MAVLINK_MSG_ID_REQUEST_DATA_STREAM, btn_params);
        if (!msg) {
            console.log("[send_request_data_stream_command] mavlink message is null");
        }
        else {
            if (mavPort) {
                if (mavPort.isOpen) {
                    mavPort.write(msg);
                }
            }
        }
    }
    catch (ex) {
        console.log('[ERROR] ', ex);
    }
}

function send_param_get_command() {
    let btn_params = {};
    btn_params.target_system = my_system_id;
    btn_params.target_component = -1;
    btn_params.param_id = "AHRS_ORIENTATION";
    btn_params.param_index = -1;

    try {
        let msg = mavlinkGenerateMessage(255, 0xbe, mavlink.MAVLINK_MSG_ID_PARAM_REQUEST_READ, btn_params);
        if (!msg) {
            console.log("mavlink message is null");
        }
        else {
            if (mavPort) {
                if (mavPort.isOpen) {
                    mavPort.write(msg, () => {
                        console.log('Send AHRS_ORIENTATION param get command.');
                    });
                }
            }
        }
    }
    catch (ex) {
        console.log('[ERROR] ' + ex);
    }

    if (ant_type === '') {
        setTimeout(send_param_get_command, 1000);
    }
}

function tr_mqtt_connect(serverip) {
    if (!tr_mqtt_client) {
        let connectOptions = {
            host: serverip,
            port: 1883,
            protocol: "mqtt",
            keepalive: 10,
            clientId: 'get_tracker_FC_' + nanoid(15),
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
            console.log('tr_mqtt_client is connected ' + serverip);

            if (pn_dinfo_topic !== '') {
                tr_mqtt_client.subscribe(pn_dinfo_topic, () => {
                    console.log('[tr_mqtt_client] pn_ctrl_topic is subscribed -> ', pn_dinfo_topic);
                });
            }
            if (pn_offset_topic !== '') {
                tr_mqtt_client.subscribe(pn_offset_topic, () => {
                    console.log('[tr_mqtt_client] pn_offset_topic is subscribed -> ', pn_offset_topic);
                });
            }
            if (pn_cmd_topic !== '') {
                tr_mqtt_client.subscribe(pn_cmd_topic, () => {
                    console.log('[tr_mqtt_client] pn_cmd_topic is subscribed -> ', pn_cmd_topic);
                });
            }
        });

        tr_mqtt_client.on('error', (err) => {
            console.log('[tr_mqtt_client error] ' + err.message);
        });

        tr_mqtt_client.on('message', (topic, message) => {
            if (topic === pn_dinfo_topic) { // 모터 제어 메세지 수신
                let drone_info = JSON.parse(message.toString());
                fs.writeFileSync('./drone_info.json', JSON.stringify(drone_info, null, 4), 'utf8');
            }
            else if (topic === pn_cmd_topic) {
                if (message.toString() === 'run') {
                    let btn_params = {};
                    btn_params.target_system = my_system_id;
                    btn_params.target_component = 1;
                    btn_params.command = mavlink.MAV_CMD_COMPONENT_ARM_DISARM;
                    btn_params.confirmation = 0;
                    btn_params.param1 = 1;
                    btn_params.param2 = 1;
                    btn_params.param3 = 65535;
                    btn_params.param4 = 65535;
                    btn_params.param5 = 65535;
                    btn_params.param6 = 65535;
                    btn_params.param7 = 65535;

                    try {
                        let msg = mavlinkGenerateMessage(255, 0xbe, mavlink.MAVLINK_MSG_ID_COMMAND_LONG, btn_params);
                        if (!msg) {
                            console.log("mavlink message is null");
                        }
                        else {
                            if (mavPort) {
                                if (mavPort.isOpen) {
                                    mavPort.write(msg);
                                }
                            }
                        }
                    }
                    catch (ex) {
                        console.log('[ERROR] ' + ex);
                    }
                }
                else {
                    if (mavPort) {
                        if (mavPort.isOpen) {
                            mavPort.write(message);
                        }
                    }
                }
            }
            else if (topic === pn_offset_topic) {
                let offsetObj = JSON.parse(message.toString());
                console.log('offsetObj -', offsetObj);
                if (offsetObj.hasOwnProperty('type')) {
                    let btn_params;
                    if (offsetObj.type === "T90") {
                        btn_params = {};
                        btn_params.target_system = my_system_id;
                        btn_params.target_component = 1;
                        btn_params.param_id = "AHRS_ORIENTATION";
                        btn_params.param_type = mavlink.MAV_PARAM_TYPE_INT8;
                        btn_params.param_value = 24; // PITCH90
                    }
                    else {
                        btn_params = {};
                        btn_params.target_system = my_system_id;
                        btn_params.target_component = 1;
                        btn_params.param_id = "AHRS_ORIENTATION";
                        btn_params.param_type = mavlink.MAV_PARAM_TYPE_INT8;
                        btn_params.param_value = 0; // None
                    }
                    try {
                        let msg = mavlinkGenerateMessage(255, 0xbe, mavlink.MAVLINK_MSG_ID_PARAM_SET, btn_params);
                        if (!msg) {
                            console.log("mavlink message is null");
                        }
                        else {
                            if (mavPort) {
                                if (mavPort.isOpen) {
                                    mavPort.write(msg, () => {
                                        console.log('Send AHRS_ORIENTATION param set command.');
                                    });
                                }
                            }
                        }
                    }
                    catch (ex) {
                        console.log('[ERROR] ' + ex);
                    }
                }
            }
        });
    }
}

function parseMavFromDrone(mavPacket) {
    try {
        if (mavPacket._id === mavlink.MAVLINK_MSG_ID_GLOBAL_POSITION_INT) { // #33
            let _global_position_int_msg = {};

            _global_position_int_msg.time_boot_ms = mavPacket.time_boot_ms;
            _global_position_int_msg.lat = mavPacket.lat;
            _global_position_int_msg.lon = mavPacket.lon;
            _global_position_int_msg.alt = mavPacket.alt;
            _global_position_int_msg.relative_alt = mavPacket.relative_alt;
            _global_position_int_msg.vx = mavPacket.vx;
            _global_position_int_msg.vy = mavPacket.vy;
            _global_position_int_msg.vz = mavPacket.vz;
            _global_position_int_msg.hdg = mavPacket.hdg;

            let _lat = _global_position_int_msg.lat / 10000000;
            let _lon = _global_position_int_msg.lon / 10000000
            if ((33 < _lat && _lat < 43) && ((124 < _lon && _lon < 132))) {
                // console.log('[_global_position_int_msg] -> ', _global_position_int_msg.lat, _global_position_int_msg.lon, _global_position_int_msg.hdg);

                global_position_int_msg = JSON.parse(JSON.stringify(_global_position_int_msg));
                position_refresh_flag = 1;

            }
            else {
                _global_position_int_msg.lat = global_position_int_msg.lat;
                _global_position_int_msg.lon = global_position_int_msg.lon;

                global_position_int_msg = JSON.parse(JSON.stringify(_global_position_int_msg));
                position_refresh_flag = 1;
            }

            if (tr_mqtt_client) {
                tr_mqtt_client.publish(gps_pos_topic, JSON.stringify(global_position_int_msg), () => {
                    console.log('publish globalpositionint_msg to local mqtt(' + gps_pos_topic + ') : ', JSON.stringify(global_position_int_msg));
                });
            }
        }
        else if (mavPacket._id === mavlink.MAVLINK_MSG_ID_ATTITUDE) {
            let _attitude_msg = {};
            _attitude_msg.time_boot_ms = mavPacket.time_boot_ms;
            _attitude_msg.roll = mavPacket.roll;
            _attitude_msg.pitch = mavPacket.pitch;
            _attitude_msg.yaw = mavPacket.yaw;
            _attitude_msg.rollspeed = mavPacket.rollspeed;
            _attitude_msg.pitchspeed = mavPacket.pitchspeed;
            _attitude_msg.yawspeed = mavPacket.yawspeed;

            if (_attitude_msg.yaw < 0) {
                _attitude_msg.yaw += (2 * Math.PI);
            }

            let tracker_yaw = Math.round(((_attitude_msg.yaw * 180) / Math.PI) * 10) / 10;
            console.log('[yaw] -> ', tracker_yaw);

            let tracker_pitch = Math.round(((_attitude_msg.pitch * 180) / Math.PI) * 10) / 10;
            console.log('[pitch] -> ', tracker_pitch);

            attitude_msg = JSON.parse(JSON.stringify(_attitude_msg));

            if (tr_mqtt_client) {
                tr_mqtt_client.publish(gps_att_topic, JSON.stringify(attitude_msg), () => {
                    console.log('publish attitude_msg to local mqtt(' + gps_att_topic + ') : ', JSON.stringify(attitude_msg));
                });
            }
        }
        else if (mavPacket._id === mavlink.MAVLINK_MSG_ID_GPS_RAW_INT) {
            let _gps_raw_int_msg = {};
            _gps_raw_int_msg.fix_type = mavPacket.fix_type;
            _gps_raw_int_msg.satellites_visible = mavPacket.satellites_visible;

            gps_raw_int_msg = JSON.parse(JSON.stringify(_gps_raw_int_msg));

            if (tr_mqtt_client) {
                tr_mqtt_client.publish(gps_raw_topic, JSON.stringify(gps_raw_int_msg), () => {
                    console.log('publish gps_raw_int_msg to local mqtt(' + gps_raw_topic + ') : ', JSON.stringify(gps_raw_int_msg));
                });
            }
        }
        else if (mavPacket._id === mavlink.MAVLINK_MSG_ID_PARAM_VALUE) {
            let param_id = mavPacket.param_id;

            if (param_id.includes('AHRS_ORIENTATION')) {
                let param_value = mavPacket.param_value;

                if (param_value === 0) {
                    ant_type = "T0";
                }
                else if (param_value === 24) {
                    ant_type = "T90";
                }

                if (tr_mqtt_client) {
                    tr_mqtt_client.publish(gps_type_topic, ant_type, () => {
                        console.log('publish ahrs_orientation_msg to local mqtt(' + gps_type_topic + ') : ', ant_type);
                    });
                }
            }
        }
    }
    catch (e) {
        console.log('[parseMavFromDrone Error]', e);
    }
}

function mavlinkGenerateMessage(src_sys_id, src_comp_id, type, params) {
    let mavlinkParser;
    if (mavVersion === 'v1') {
        mavlinkParser = new MAVLink10Processor(null/*logger*/, src_sys_id, src_comp_id);
    }
    else if (mavVersion === 'v2') {
        mavlinkParser = new MAVLink20Processor(null/*logger*/, src_sys_id, src_comp_id);
    }

    let mavMsg = null;
    let genMsg = null;
    try {
        switch (type) {
            // MESSAGE ////////////////////////////////////
            case mavlink.MAVLINK_MSG_ID_PARAM_SET:
                mavMsg = new mavlink.messages.param_set(
                    params.target_system,
                    params.target_component,
                    params.param_id,
                    params.param_value,
                    params.param_type
                );
                break;
            case mavlink.MAVLINK_MSG_ID_PARAM_REQUEST_READ:
                mavMsg = new mavlink.messages.param_request_read(
                    params.target_system,
                    params.target_component,
                    params.param_id,
                    params.param_index
                );
                break;
            case mavlink.MAVLINK_MSG_ID_COMMAND_LONG:
                mavMsg = new mavlink.messages.command_long(
                    params.target_system,
                    params.target_component,
                    params.command,
                    params.confirmation,
                    params.param1,
                    params.param2,
                    params.param3,
                    params.param4,
                    params.param5,
                    params.param6,
                    params.param7
                );
                break;
            case mavlink.MAVLINK_MSG_ID_REQUEST_DATA_STREAM:
                mavMsg = new mavlink.messages.request_data_stream(
                    params.target_system,
                    params.target_component,
                    params.req_stream_id,
                    params.req_message_rate,
                    params.start_stop
                );
                break;
        }
    }
    catch (e) {
        console.log('MAVLINK EX:' + e);
    }

    if (mavMsg) {
        genMsg = Buffer.from(mavMsg.pack(mavlinkParser));
        //console.log('>>>>> MAVLINK OUTGOING MSG: ' + genMsg.toString('hex'));
    }

    return genMsg;
}

const MavLinkProtocolV1 = {
    NAME: 'MAV_V1',
    START_BYTE: 0xFE,
    PAYLOAD_OFFSET: 6,
    CHECKSUM_LENGTH: 2,
    SYS_ID: my_system_id,
    COMP_ID: 1,
};

const MavLinkProtocolV2 = {
    NAME: 'MAV_V2',
    START_BYTE: 0xFD,
    PAYLOAD_OFFSET: 10,
    CHECKSUM_LENGTH: 2,
    SYS_ID: my_system_id,
    COMP_ID: 1,
    IFLAG_SIGNED: 0x01
};

const KNOWN_PROTOCOLS_BY_STX = {
    [MavLinkProtocolV1.START_BYTE]: MavLinkProtocolV1,
    [MavLinkProtocolV2.START_BYTE]: MavLinkProtocolV2,
};

function findStartOfPacket(buffer) {
    const stxv1 = buffer.indexOf(MavLinkProtocolV1.START_BYTE)
    const stxv2 = buffer.indexOf(MavLinkProtocolV2.START_BYTE)

    if (stxv1 >= 0 && stxv2 >= 0) {
        // in the current buffer both STX v1 and v2 are found - get the first one
        if (stxv1 < stxv2) {
            return stxv1
        }
        else {
            return stxv2
        }
    }
    else if (stxv1 >= 0) {
        // in the current buffer STX v1 is found
        return stxv1
    }
    else if (stxv2 >= 0) {
        // in the current buffer STX v2 is found
        return stxv2
    }
    else {
        // no STX found
        return null
    }
}

function getPacketProtocol(buffer) {
    return KNOWN_PROTOCOLS_BY_STX[buffer.readUInt8(0)] || null
}

function readPacketLength(buffer, Protocol) {
    // check if the current buffer contains the entire message
    const payloadLength = buffer.readUInt8(1)
    return Protocol.PAYLOAD_OFFSET
        + payloadLength
        + Protocol.CHECKSUM_LENGTH
        + (isV2Signed(buffer) ? 13 : 0)
}

function isV2Signed(buffer) {
    const protocol = buffer.readUInt8(0)
    if (protocol === MavLinkProtocolV2.START_BYTE) {
        const flags = buffer.readUInt8(2)
        return !!(flags & MavLinkProtocolV2.IFLAG_SIGNED)
    }
}
