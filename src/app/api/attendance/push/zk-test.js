const ZKLib = require('node-zklib');
const DEVICE_IP = '192.168.1.201';

(async () => {
  const zk = new ZKLib(DEVICE_IP, 4370, 10000, 4000);
  try {
    await zk.createSocket();
    console.log('Connected to the device!');

    const info = await zk.getInfo();
    console.log('Device info:', info);

    try {
      const users = await zk.getUsers();
      console.log('Users:', users.data);
    } catch (e) {
      console.log('No users yet. Please enroll a device first.');
    }

    try {
      const logs = await zk.getAttendances();
      console.log('Attendance logs:', logs.data);
    } catch (e) {
      console.log('No attendance logs yet. Please scan your badge.');
    }

    await zk.disconnect();
  } catch (e) {
    console.error('Could not connect:', e.message);
  }
})();