import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    setPersistence,
    browserLocalPersistence,
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getDatabase, 
    ref, 
    set, 
    get, 
    child, 
    onValue, 
    push 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// Конфігурація Firebase
const firebaseConfig = {
  apiKey: "AIzaSyBZ28ZGCSTtb659rpmp0mgf_hcv1AVscFQ",
  authDomain: "intermap-app.firebaseapp.com",
  databaseURL: "https://intermap-app-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "intermap-app",
  storageBucket: "intermap-app.firebasestorage.app",
  messagingSenderId: "869707502446",
  appId: "1:869707502446:web:9cd7b1cab1c74f5e79e77f",
  measurementId: "G-QB0SF133NB"
};

// Ініціалізація
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);

setPersistence(auth, browserLocalPersistence);

const OWNER_EMAILS = [
    "vanyary16@gmail.com",
];

function safeToast(msg, type) {
    if (window.UI && window.UI.showToast) {
        window.UI.showToast(msg, type);
    } else {
        alert(msg);
    }
}

// ==========================================
// 1. СИСТЕМА АВТОРИЗАЦІЇ (FIREBASE AUTH)
// ==========================================

export const FirebaseAuthModule = {
    // Реєстрація нового користувача
    async register(email, password) {
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            const role = OWNER_EMAILS.includes(email) ? 'admin' : 'student';

            await set(ref(db, 'users/' + user.uid), {
                uid: user.uid,
                email: email,
                role: role,
                createdAt: new Date().toISOString(),
                status: 'Active'
            });

            safeToast('Акаунт успішно створено!', 'success');
            return user;
        } catch (error) {
            safeToast(this.getErrorMessage(error.code), 'error');
            throw error;
        }
    },

    // Вхід за Email та Паролем
    async login(email, password) {
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            safeToast('Вхід успішний!', 'success');
            return userCredential.user;
        } catch (error) {
            safeToast(this.getErrorMessage(error.code), 'error');
            throw error;
        }
    },

    // Вхід через Google
    async googleLogin() {
        try {
            const provider = new GoogleAuthProvider();
            const userCredential = await signInWithPopup(auth, provider);
            safeToast('Успішний вхід через Google!', 'success');
            return userCredential.user;
        } catch (error) {
            safeToast('Помилка Google Auth: ' + error.message, 'error');
        }
    },

    // Вхід для адміна (Triple Auth + Firebase)
    async handleTripleAuth(email, password, tgUsername, googleSecret) {
        if (tgUsername !== "@IvanIntermap" || googleSecret !== "G-161013") {
            safeToast('Невірний Telegram Username або Secret Key!', 'error');
            return;
        }

        try {
            const user = await this.login(email, password);
            if (OWNER_EMAILS.includes(email)) {
                localStorage.setItem('isOwnerAuthorized', 'true');
                localStorage.setItem('userRole', 'admin');
                localStorage.setItem('userEmail', email);
                window.location.href = 'admin.html';
            } else {
                safeToast('Ваш акаунт не має прав Власника!', 'error');
            }
        } catch (e) {
            console.error(e);
        }
    },

    // Вихід з акаунта
    async logout() {
        await signOut(auth);
        localStorage.removeItem('isOwnerAuthorized');
        localStorage.removeItem('userRole');
        localStorage.removeItem('userEmail');
        safeToast('Ви вийшли з акаунта', 'info');
    },

    getErrorMessage(code) {
        switch (code) {
            case 'auth/email-already-in-use': return 'Цей Email вже зареєстровано!';
            case 'auth/invalid-email': return 'Некоректний Email!';
            case 'auth/weak-password': return 'Пароль має бути не менше 6 символів!';
            case 'auth/user-not-found': return 'Користувача з таким Email не знайдено!';
            case 'auth/wrong-password': return 'Невірний пароль!';
            default: return 'Помилка авторизації: ' + code;
        }
    }
};

// ==========================================
// 2. REALTIME DATABASE СИНХРОНІЗАЦІЯ
// ==========================================

export const FirebaseDB = {
    listenToTests(callback) {
        const testsRef = ref(db, 'tests');
        onValue(testsRef, (snapshot) => {
            const data = snapshot.val();
            const testsList = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : [];
            callback(testsList);
        });
    },

    async saveSubmission(submissionData) {
        const submissionsRef = ref(db, 'submissions');
        const newSubRef = push(submissionsRef);
        await set(newSubRef, {
            ...submissionData,
            createdAt: new Date().toISOString()
        });
    },

    listenToLeaderboard(callback) {
        const subRef = ref(db, 'submissions');
        onValue(subRef, (snapshot) => {
            const data = snapshot.val();
            const list = data ? Object.values(data) : [];
            callback(list);
        });
    }
};

// Експортуємо модулі у глобальну область
window.FirebaseAuthModule = FirebaseAuthModule;
window.FirebaseDB = FirebaseDB;

// ==========================================
// 3. СТАТУС АВТОРИЗАЦІЇ В РЕАЛЬНОМУ ЧАСІ
// ==========================================

onAuthStateChanged(auth, async (user) => {
    window.IntermapState = window.IntermapState || {};

    if (user) {
        const dbRef = ref(db);
        let userData = { email: user.email, role: 'student' };
        try {
            const snapshot = await get(child(dbRef, `users/${user.uid}`));
            if (snapshot.exists()) userData = snapshot.val();
        } catch (e) {
            console.error(e);
        }

        window.IntermapState.currentUser = userData;
        localStorage.setItem('userEmail', user.email);
        localStorage.setItem('userRole', userData.role);

        if (userData.role === 'admin') {
            localStorage.setItem('isOwnerAuthorized', 'true');
        }
    } else {
        window.IntermapState.currentUser = null;
        localStorage.removeItem('isOwnerAuthorized');
        localStorage.removeItem('userRole');
        localStorage.removeItem('userEmail');
    }
});
