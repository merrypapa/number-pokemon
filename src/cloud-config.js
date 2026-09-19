// 클라우드(계정·저장 공유) 설정. 비워 두면 게임은 지금처럼 이 기기 저장만 쓴다.
// Firebase 콘솔(https://console.firebase.google.com) → 프로젝트 → 웹 앱 추가 → "SDK 설정 및 구성"의 firebaseConfig 값을 아래에 붙여넣는다.
// (이 값들은 공개용 키라 저장소에 올려도 된다. 데이터 보호는 firestore.rules 가 한다.) 자세한 순서는 README 의 "클라우드 계정" 항목.
export const CLOUD_CONFIG = {
  firebase: {
    apiKey: 'AIzaSyAn90q4furg779TKDYV2bEawWYKUtJTQ6Q',
    authDomain: 'number-pokemon.firebaseapp.com',
    projectId: 'number-pokemon',
    storageBucket: 'number-pokemon.firebasestorage.app',
    messagingSenderId: '952434235167',
    appId: '1:952434235167:web:f3fc2b1b5b1fd319fa022a',
  },
};
