const {SerialPort} = require('serialport');



//------------- Can communication -------------
let canPortOpening = (canPortNum, canBaudRate) => {
    if (canPort == null) {
        canPort = new SerialPort({
            path: canPortNum,
            baudRate: parseInt(canBaudRate, 10),
        });

        canPort.on('open', canPortOpen);
        canPort.on('close', canPortClose);
        canPort.on('error', canPortError);
        canPort.on('data', canPortData);
    }
    else {
        if (canPort.isOpen) {
            canPort.close();
            canPort = null;
            setTimeout(this.canPortOpening, 2000);
        }
        else {
            canPort.open();
        }
    }
}

let canPortOpen = () => {
    console.log('canPort (' + canPort.path + '), canPort rate: ' + canPort.baudRate + ' open.');
}

let canPortClose = () => {
    console.log('[pan] canPort closed.');

    setTimeout(this.canPortOpening, 2000);
}

let canPortError = (error) => {
    console.log('[pan] canPort error : ' + error);

    setTimeout(this.canPortOpening, 2000);
}

let canPortData = (data) => {
    console.log(data.toString());
}

//---------------------------------------------------


let switchConfigMode = (callback) => {
    if (canPort !== null) {
        if (canPort.isOpen) {
            canPort.write("+++", () => {
                callback();
            });
        }
    }
}

let setTheBaudrateUART = (callback) => {
    if (canPort !== null) {
        if (canPort.isOpen) {
            canPort.write("AT+S=4\r\n", () => {
                callback();
            });
        }
    }
}

let setTheBaudrateCAN = (callback) => {
    if (canPort !== null) {
        if (canPort.isOpen) {
            canPort.write("AT+C=18\r\n", () => {
                callback();
            });
        }
    }
}

let setMask0 = (callback) => {
    if (canPort !== null) {
        if (canPort.isOpen) {
            canPort.write("AT+M=[0][0][000007FF]\r\n", () => {
                callback();
            });
        }
    }
}

let setMask1 = (callback) => {
    if (canPort !== null) {
        if (canPort.isOpen) {
            canPort.write("AT+M=[1][0][000007FF]\r\n", () => {
                callback();
            });
        }
    }
}

// 처음에 baudrate 115200으로 세팅

const first = process.argv[2];
if(first === 'baudrate_uart') {
    canPortOpening('/dev/ttyAMA1', '9600');

    setTimeout(() => {
        switchConfigMode(() => {
            console.log('+++');
        });
        setTimeout(() => {
            setTheBaudrateUART(() => {
                console.log('AT+S=4');
            });
        }, 3000);
    }, 3000);
}
else if(first === 'baudrate_can') {
    canPortOpening('/dev/ttyAMA1', '115200');

    setTimeout(() => {
        switchConfigMode(() => {
            console.log('+++');
        });
        setTimeout(() => {
            setTheBaudrateCAN(() => {
                console.log('AT+C=18');
            });
            setTimeout(() => {
                setMask0(() => {
                    console.log('AT+M=[0][0][000007FF]');
                });
                setTimeout(() => {
                    setMask1(() => {
                        console.log('AT+M=[1][0][000007FF]');
                    });
                }, 3000);
            }, 3000);
        }, 3000);
    }, 3000);
}


