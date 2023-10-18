const {SerialPort} = require('serialport');

let sbus1Port = null;
let sbus1PortNum = '/dev/ttyAMA3';
let sbus1Baudrate = 100000;

let sequence = 0;
let sbus_gen_tid = null;

const CH_SCALE = 8;

let SBUS1_CH = new Uint16Array([1001, 1001, 1001, 1001, 201, 201, 201, 201, 201, 201, 369, 201, 201, 201, 201, 201, 223, 223]);

let sbus1PortOpening = () => {
    if (!sbus1Port) {
        sbus1Port = new SerialPort({
            path: sbus1PortNum,
            baudRate: parseInt(sbus1Baudrate, 10),
            dataBits: 8,
            stopBits: 2,
            parity: "none"
        });

        sbus1Port.on('open', () => {
            console.log('sbus1Port(' + sbus1Port.path + '), sbus1Port rate: ' + sbus1Port.baudRate + ' open.');

            setTimeout(init, 1000);
        });

        sbus1Port.on('close', () => {
            console.log('sbus1Port closed.');

            setTimeout(sbus1PortOpening, 2000);
        });

        sbus1Port.on('error', (error) => {
            console.log('[sbus1Port error]: ' + error.message);

            setTimeout(sbus1PortOpening, 2000);
        });

        // sbus1Port.on('data', (data) => {
        //     //let _resData = data.toString('hex').toLowerCase();
        //
        //     //_resData = (sequence.toString(16).padStart(2, '0')) + _resData;
        //
        //     // if (dr_mqtt_client) {
        //     //     dr_mqtt_client.publish(res_topic, Buffer.from(_resData, 'hex'));
        //     // }
        //     //
        //     // if (mobius_mqtt_client) {
        //     //     mobius_mqtt_client.publish(res_topic, Buffer.from(_resData, 'hex'));
        //     // }
        //
        //
        //     //sequence++;
        //     //sequence %= 255;
        // });
    }
    else {
        if (sbus1Port.isOpen) {
            sbus1Port.close();
            sbus1Port = null;
            //setTimeout(sbus1PortOpening, 2000);
        }
        else {
            sbus1Port.open();
        }
    }
}

const CH_VAL_MAX = 1800; // 225;
const CH_VAL_MID = 1024; // 128;
const CH_VAL_MIDMIN = 368; // 46;
const CH_VAL_MIN = 200; //25;

let sbus_ch_val = [
    255,
    CH_VAL_MID,
    CH_VAL_MID,
    CH_VAL_MID,
    CH_VAL_MID,
    CH_VAL_MIDMIN,
    CH_VAL_MIN,
    CH_VAL_MIN,
    CH_VAL_MIN,
    CH_VAL_MID,
    CH_VAL_MID,
    CH_VAL_MIDMIN,
    CH_VAL_MID,
    CH_VAL_MID,
    CH_VAL_MID,
    CH_VAL_MID,
    CH_VAL_MID,
];

let SbusDataGenerator = () => {
    Parse_RcData(sbus_ch_val);
}

let Parse_RcData = (ch_val) => {
    let GCS_DataBuffer = [];
    for(let i = 0; i < ch_val.length-1; i++) {
        SBUS1_CH[i] =  ch_val[i+1];
    }

    //Buffer.from(ch_val, 'hex').readUInt16LE(0);;

    //console.log('SBUS1_CH', SBUS1_CH);

    // SBUS1_CH[0] =  GCS_DataBuffer[1];  //GCS_DataBuffer[1] * CH_SCALE + 1;
    // SBUS1_CH[1] =  GCS_DataBuffer[2];  //GCS_DataBuffer[2] * CH_SCALE + 1;
    // SBUS1_CH[2] =  GCS_DataBuffer[3];  //GCS_DataBuffer[3] * CH_SCALE + 1;
    // SBUS1_CH[3] =  GCS_DataBuffer[4];  //GCS_DataBuffer[4] * CH_SCALE + 1;
    // SBUS1_CH[4] =  GCS_DataBuffer[5];  //GCS_DataBuffer[5] * CH_SCALE + 1;
    // SBUS1_CH[5] =  GCS_DataBuffer[6];  //GCS_DataBuffer[6] * CH_SCALE + 1;
    // SBUS1_CH[6] =  GCS_DataBuffer[7];  //GCS_DataBuffer[7] * CH_SCALE + 1;
    // SBUS1_CH[7] =  GCS_DataBuffer[8];  //GCS_DataBuffer[8] * CH_SCALE + 1;
    // SBUS1_CH[8] =  GCS_DataBuffer[9];  //GCS_DataBuffer[9] * CH_SCALE + 1;
    // SBUS1_CH[9] =  GCS_DataBuffer[10]; //GCS_DataBuffer[10] * CH_SCALE + 1;
    // SBUS1_CH[10] = GCS_DataBuffer[11]; //GCS_DataBuffer[11] * CH_SCALE + 1;
    // SBUS1_CH[11] = GCS_DataBuffer[12]; //GCS_DataBuffer[12] * CH_SCALE + 1;
    // SBUS1_CH[12] = GCS_DataBuffer[13]; //GCS_DataBuffer[13] * CH_SCALE + 1;
    // SBUS1_CH[13] = GCS_DataBuffer[14]; //GCS_DataBuffer[14] * CH_SCALE + 1;
    // SBUS1_CH[14] = GCS_DataBuffer[15]; //GCS_DataBuffer[15] * CH_SCALE + 1;
    // SBUS1_CH[15] = GCS_DataBuffer[16]; //GCS_DataBuffer[16] * CH_SCALE + 1;

    //console.log('SBUS1_CH', SBUS1_CH);

    sbus1Packet_Generator(SBUS1_CH);
}

let sbus1Packet_Generator = (SBUS_CH) => {
    let SBUS_Buffer = [];
    SBUS_Buffer.push(0x0f);
    SBUS_Buffer.push((SBUS_CH[0] & 0x07FF));
    SBUS_Buffer.push((SBUS_CH[0] & 0x07FF) >> 8 | (SBUS_CH[1] & 0x07FF) << 3);
    SBUS_Buffer.push((SBUS_CH[1] & 0x07FF) >> 5 | (SBUS_CH[2] & 0x07FF) << 6);
    SBUS_Buffer.push((SBUS_CH[2] & 0x07FF) >> 2);
    SBUS_Buffer.push((SBUS_CH[2] & 0x07FF) >> 10 | (SBUS_CH[3] & 0x07FF) << 1);
    SBUS_Buffer.push((SBUS_CH[3] & 0x07FF) >> 7 | (SBUS_CH[4] & 0x07FF) << 4);
    SBUS_Buffer.push((SBUS_CH[4] & 0x07FF) >> 4 | (SBUS_CH[5] & 0x07FF) << 7);
    SBUS_Buffer.push((SBUS_CH[5] & 0x07FF) >> 1);
    SBUS_Buffer.push((SBUS_CH[5] & 0x07FF) >> 9 | (SBUS_CH[6] & 0x07FF) << 2);
    SBUS_Buffer.push((SBUS_CH[6] & 0x07FF) >> 6 | (SBUS_CH[7] & 0x07FF) << 5);
    SBUS_Buffer.push((SBUS_CH[7] & 0x07FF) >> 3);
    SBUS_Buffer.push((SBUS_CH[8] & 0x07FF));
    SBUS_Buffer.push((SBUS_CH[8] & 0x07FF) >> 8 | (SBUS_CH[9] & 0x07FF) << 3);
    SBUS_Buffer.push((SBUS_CH[9] & 0x07FF) >> 5 | (SBUS_CH[10] & 0x07FF) << 6);
    SBUS_Buffer.push((SBUS_CH[10] & 0x07FF) >> 2);
    SBUS_Buffer.push((SBUS_CH[10] & 0x07FF) >> 10 | (SBUS_CH[11] & 0x07FF) << 1);
    SBUS_Buffer.push((SBUS_CH[11] & 0x07FF) >> 7 | (SBUS_CH[12] & 0x07FF) << 4);
    SBUS_Buffer.push((SBUS_CH[12] & 0x07FF) >> 4 | (SBUS_CH[13] & 0x07FF) << 7);
    SBUS_Buffer.push((SBUS_CH[13] & 0x07FF) >> 1);
    SBUS_Buffer.push((SBUS_CH[13] & 0x07FF) >> 9 | (SBUS_CH[14] & 0x07FF) << 2);
    SBUS_Buffer.push((SBUS_CH[14] & 0x07FF) >> 6 | (SBUS_CH[15] & 0x07FF) << 5);
    SBUS_Buffer.push((SBUS_CH[15] & 0x07FF) >> 3);

    SBUS_Buffer.push(0x00);
    SBUS_Buffer.push(0x00);

    if (sbus1Port) {
        sbus1Port.write(Buffer.from(SBUS_Buffer, 'hex'), () => {
            // console.log('SBUS_Buffer -\t\t', Buffer.from(SBUS_Buffer, 'hex'));
        });
    }
}

exports.setDelta = (pan_diff_angle, tilt_diff_angle) => {
    // pan
    sbus_ch_val[4] = CH_VAL_MID + pan_diff_angle;
    if (sbus_ch_val[4] >= CH_VAL_MAX) {
        sbus_ch_val[4] = CH_VAL_MAX;
    }
    else if (sbus_ch_val[4] <= CH_VAL_MIN) {
        sbus_ch_val[4] = CH_VAL_MIN;
    }

    // tilt
    sbus_ch_val[2] = CH_VAL_MID - tilt_diff_angle;
    if (sbus_ch_val[2] >= CH_VAL_MAX) {
        sbus_ch_val[2] = CH_VAL_MAX;
    }
    else if (sbus_ch_val[2] <= CH_VAL_MIN) {
        sbus_ch_val[2] = CH_VAL_MIN;
    }
    console.log('PAN -', sbus_ch_val[4], ' TILT -', sbus_ch_val[2]);
}

exports.setStop = () => {
    sbus_ch_val[4] = CH_VAL_MID;
    sbus_ch_val[2] = CH_VAL_MID;
}

let init = () => {
    if (sbus_gen_tid) {
        clearInterval(sbus_gen_tid);
        sbus_gen_tid = null;
    }

    sbus_gen_tid = setInterval(SbusDataGenerator, 15);
}

sbus1PortOpening();
