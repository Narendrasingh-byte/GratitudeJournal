import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, Text, View, TextInput, TouchableOpacity, 
  ScrollView, Alert, StatusBar, Share, Keyboard, ActivityIndicator 
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FontAwesome, Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av'; // STABLE LIBRARY

export default function App() {
  // --- STATE ---
  const [view, setView] = useState('auth'); 
  const [authMode, setAuthMode] = useState('login');
  const [user, setUser] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  const [entryText, setEntryText] = useState('');
  const [selectedMood, setSelectedMood] = useState('😊');
  const [entries, setEntries] = useState([]);
  const [quote, setQuote] = useState({ text: 'Fetching...', author: '' });
  const [isDark, setIsDark] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // --- AUDIO STATE ---
  const [recording, setRecording] = useState();
  const [recordedUri, setRecordedUri] = useState(null);
  const [soundObject, setSoundObject] = useState(null);
  
  const moods = ['😊', '🤩', '😔', '😡', '😴', '🙏'];
  const colors = {
    bgStart: isDark ? '#0f172a' : '#667eea',
    bgEnd: isDark ? '#1e293b' : '#764ba2',
    card: isDark ? 'rgba(30, 41, 59, 0.95)' : 'rgba(255, 255, 255, 0.95)',
    text: isDark ? '#f1f5f9' : '#1f2937',
    subText: isDark ? '#cbd5e1' : '#4b5563',
    inputBorder: isDark ? '#475569' : '#e2e8f0',
  };

  useEffect(() => { 
    checkLogin(); 
    return () => {
      if (soundObject) soundObject.unloadAsync();
    };
  }, []);
  
  useEffect(() => { if (user) { loadEntries(); fetchQuote(); } }, [user]);

  // --- AUTH LOGIC ---
  const checkLogin = async () => {
    try {
      const loggedInUser = await AsyncStorage.getItem('currentUser');
      if (loggedInUser) { setUser(loggedInUser); setView('journal'); }
    } catch (e) { console.log(e); } 
    finally { setIsLoading(false); }
  };

  const handleAuth = async () => {
    if (!username || !password) { Alert.alert('Error', 'Please fill fields'); return; }
    try {
      const storedUsers = JSON.parse(await AsyncStorage.getItem('users')) || {};
      if (authMode === 'signup') {
        if (storedUsers[username]) Alert.alert('Error', 'User exists');
        else {
          storedUsers[username] = password;
          await AsyncStorage.setItem('users', JSON.stringify(storedUsers));
          loginUser(username);
        }
      } else {
        if (storedUsers[username] === password) loginUser(username);
        else Alert.alert('Error', 'Wrong password');
      }
    } catch (e) { Alert.alert('Error', 'Login failed'); }
  };

  const loginUser = async (uName) => {
    await AsyncStorage.setItem('currentUser', uName);
    setUser(uName); setView('journal');
  };

  const logout = async () => {
    await AsyncStorage.removeItem('currentUser');
    setUser(null); setView('auth');
  };

  // --- RECORDING LOGIC (Using Stable expo-av) ---
  async function startRecording() {
    try {
      const permission = await Audio.requestPermissionsAsync();
      
      if (permission.status === 'granted') {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });

        const { recording } = await Audio.Recording.createAsync(
           Audio.RecordingOptionsPresets.HIGH_QUALITY
        );

        setRecording(recording);
      } else {
        Alert.alert("Permission Denied", "Microphone permission is required.");
      }
    } catch (err) {
      Alert.alert('Failed to start recording', err.message);
    }
  }

  async function stopRecording() {
    if (!recording) return;
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI(); 
      setRecording(undefined);
      setRecordedUri(uri);
    } catch (error) {}
  }

  // --- AUDIO PLAYBACK ---
  async function playAudio(uri) {
    if (soundObject) {
      await soundObject.unloadAsync();
      setSoundObject(null);
    }
    try {
      const { sound } = await Audio.Sound.createAsync({ uri: uri });
      setSoundObject(sound);
      await sound.playAsync();
      
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          sound.unloadAsync();
          setSoundObject(null);
        }
      });
    } catch (error) { Alert.alert("Error", "Could not play audio"); }
  }

  // --- JOURNAL LOGIC ---
  const loadEntries = async () => {
    const all = JSON.parse(await AsyncStorage.getItem('gratitudeJournal')) || {};
    setEntries(all[user] || []);
  };

  const saveEntry = async () => {
    if (!entryText.trim() && !recordedUri) { Alert.alert("Empty", "Please write something or record a voice note."); return; }
    const newEntry = { text: entryText, mood: selectedMood, audio: recordedUri, date: new Date().toISOString() };
    const all = JSON.parse(await AsyncStorage.getItem('gratitudeJournal')) || {};
    const userEntries = all[user] || [];
    userEntries.push(newEntry);
    all[user] = userEntries;
    await AsyncStorage.setItem('gratitudeJournal', JSON.stringify(all));
    setEntries(userEntries);
    setEntryText(''); setRecordedUri(null); Keyboard.dismiss();
    Alert.alert('Saved!', 'Your memory is safe.');
  };

  const deleteEntry = async (dateToDelete) => {
    Alert.alert("Delete", "Are you sure?", [
      { text: "Cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
          const all = JSON.parse(await AsyncStorage.getItem('gratitudeJournal')) || {};
          const updated = (all[user] || []).filter(e => e.date !== dateToDelete);
          all[user] = updated;
          await AsyncStorage.setItem('gratitudeJournal', JSON.stringify(all));
          setEntries(updated);
      }}
    ]);
  };

  const speakEntry = (text) => { if(text) Speech.speak(text, { language: 'en', pitch: 1.0, rate: 0.9 }); };
  const shareEntry = async (text) => { try { await Share.share({ message: `Grateful for: ${text || 'My Voice Note'} ✨` }); } catch (error) {} };

  const fetchQuote = async () => {
    try {
      const res = await fetch('https://api.quotable.io/random?tags=wisdom');
      const data = await res.json();
      setQuote({ text: data.content, author: data.author });
    } catch { setQuote({ text: 'Gratitude turns what we have into enough.', author: 'Unknown' }); }
  };

  // --- WEEKLY REPORT ---
  const getWeeklyEntries = () => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return entries.filter(e => new Date(e.date) >= sevenDaysAgo);
  };
  const weeklyEntries = getWeeklyEntries();

  // --- UI RENDER ---
  if (isLoading) {
    return (
      <View style={{flex:1, justifyContent:'center', alignItems:'center', backgroundColor: isDark ? '#0f172a' : '#667eea'}}>
        <ActivityIndicator size="large" color="#ffffff" />
        <Text style={{color:'white', marginTop: 10}}>Starting Journal...</Text>
      </View>
    );
  }

  return (
    <LinearGradient colors={[colors.bgStart, colors.bgEnd]} style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {view === 'auth' ? (
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={styles.title}>✨ Gratitude</Text>
          <TextInput placeholder="Username" placeholderTextColor="#999" style={[styles.input, { color: colors.text, borderColor: colors.inputBorder }]} value={username} onChangeText={setUsername} />
          <TextInput placeholder="Password" placeholderTextColor="#999" secureTextEntry style={[styles.input, { color: colors.text, borderColor: colors.inputBorder }]} value={password} onChangeText={setPassword} />
          <TouchableOpacity onPress={handleAuth} style={styles.btnPrimary}><Text style={styles.btnText}>{authMode === 'login' ? 'Login' : 'Create Account'}</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}><Text style={styles.linkText}>{authMode === 'login' ? 'New? Sign up' : 'Have account? Login'}</Text></TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.journalScroll} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <View><Text style={styles.greeting}>Hi, {user}</Text><Text style={{color: 'rgba(255,255,255,0.7)'}}>{new Date().toDateString()}</Text></View>
            <View style={styles.headerIcons}>
              <TouchableOpacity onPress={() => setIsDark(!isDark)} style={styles.iconBtn}><FontAwesome name={isDark ? "sun-o" : "moon-o"} size={22} color="white" /></TouchableOpacity>
              <TouchableOpacity onPress={logout} style={[styles.iconBtn, {backgroundColor: '#ef4444'}]}><FontAwesome name="sign-out" size={18} color="white" /></TouchableOpacity>
            </View>
          </View>

          {/* Quote Card */}
          <LinearGradient colors={['#8b5cf6', '#d946ef']} style={styles.quoteBox}>
            <FontAwesome name="quote-left" size={16} color="rgba(255,255,255,0.5)" /><Text style={styles.quoteText}>{quote.text}</Text><Text style={styles.quoteAuthor}>— {quote.author}</Text>
          </LinearGradient>

          {/* New Entry Input */}
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <Text style={[styles.label, {color: colors.text}]}>How are you feeling?</Text>
            
            {/* Mood Selector */}
            <View style={styles.moodContainer}>{moods.map((m, i) => (<TouchableOpacity key={i} onPress={() => setSelectedMood(m)} style={[styles.moodBtn, selectedMood === m && styles.moodSelected]}><Text style={{fontSize: 24}}>{m}</Text></TouchableOpacity>))}</View>
            
            <TextInput multiline placeholder="Write or Record..." placeholderTextColor="#999" style={[styles.textArea, { color: colors.text, borderColor: colors.inputBorder }]} value={entryText} onChangeText={setEntryText} />
            
            <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
              
              {/* RECORD BUTTON */}
              <TouchableOpacity onPress={recording ? stopRecording : startRecording} style={[styles.recordBtn, recording && styles.recordingActive]}>
                <FontAwesome name={recording ? "stop" : "microphone"} size={20} color="white" /><Text style={{color:'white', marginLeft: 8, fontWeight:'600'}}>{recording ? "Stop" : recordedUri ? "Change Voice" : "Record Voice"}</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={saveEntry} style={styles.btnSave}><Text style={styles.btnText}>Save</Text></TouchableOpacity>
            </View>
            
            {recordedUri && !recording && (<Text style={{color: '#22c55e', fontSize: 12, marginTop: 10}}><FontAwesome name="check-circle" /> Voice note recorded!</Text>)}

          </View>

          {/* Entries List */}
          <Text style={styles.sectionTitle}>📅 Weekly Report (Last 7 Days)</Text>
          {weeklyEntries.length === 0 && <Text style={{color:'white', opacity:0.6, textAlign:'center'}}>No entries this week.</Text>}
          
          {[...weeklyEntries].reverse().map((e, i) => (
            <View key={i} style={[styles.entryCard, {backgroundColor: colors.card}]}>
              <View style={styles.entryHeader}><Text style={{fontSize: 24}}>{e.mood || '😊'}</Text><Text style={[styles.entryDate, {color: colors.subText}]}>{new Date(e.date).toLocaleDateString()}</Text></View>
              {e.text ? <Text style={[styles.entryContent, {color: colors.text}]}>{e.text}</Text> : null}
              {e.audio && (<TouchableOpacity onPress={() => playAudio(e.audio)} style={styles.audioPlayer}><Ionicons name="play-circle" size={32} color="#7e22ce" /><Text style={{color: colors.text, marginLeft: 10}}>Play Voice Note</Text></TouchableOpacity>)}
              <View style={styles.actionRow}>
                {e.text && (<TouchableOpacity onPress={() => speakEntry(e.text)} style={styles.actionBtn}><FontAwesome name="volume-up" size={18} color="#8b5cf6" /></TouchableOpacity>)}
                <TouchableOpacity onPress={() => shareEntry(e.text)} style={styles.actionBtn}><FontAwesome name="share-alt" size={18} color="#3b82f6" /></TouchableOpacity>
                <TouchableOpacity onPress={() => deleteEntry(e.date)} style={styles.actionBtn}><FontAwesome name="trash" size={18} color="#ef4444" /></TouchableOpacity>
              </View>
            </View>
          ))}
          <View style={{height: 50}} />
        </ScrollView>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 40 }, journalScroll: { padding: 20 },
  card: { padding: 20, borderRadius: 20, marginBottom: 20, elevation: 4 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#7e22ce', textAlign: 'center', marginBottom: 20 },
  input: { borderWidth: 1, borderRadius: 12, padding: 15, marginBottom: 15, fontSize: 16 },
  textArea: { borderWidth: 1, borderRadius: 12, padding: 15, marginBottom: 15, fontSize: 16, height: 100, textAlignVertical: 'top' },
  btnPrimary: { backgroundColor: '#7e22ce', padding: 15, borderRadius: 12, alignItems: 'center' },
  btnSave: { backgroundColor: '#7e22ce', paddingVertical: 12, paddingHorizontal: 25, borderRadius: 10 },
  btnText: { color: 'white', fontWeight: 'bold', fontSize: 16 }, linkText: { textAlign: 'center', color: '#7e22ce', marginTop: 15 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  greeting: { fontSize: 26, fontWeight: 'bold', color: 'white' }, headerIcons: { flexDirection: 'row', gap: 10 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  quoteBox: { padding: 20, borderRadius: 16, marginBottom: 20 }, quoteText: { color: 'white', fontSize: 16, fontStyle: 'italic', marginVertical: 8, lineHeight: 24 },
  quoteAuthor: { color: 'rgba(255,255,255,0.8)', textAlign: 'right', fontSize: 12 }, label: { fontSize: 14, fontWeight: '600', marginBottom: 10 },
  moodContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 }, moodBtn: { padding: 10, borderRadius: 50, backgroundColor: 'rgba(0,0,0,0.05)' },
  moodSelected: { backgroundColor: '#d8b4fe', transform: [{scale: 1.1}] }, sectionTitle: { fontSize: 20, fontWeight: 'bold', color: 'white', marginBottom: 15 },
  entryCard: { padding: 15, borderRadius: 16, marginBottom: 12 }, entryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  entryDate: { fontSize: 12 }, entryContent: { fontSize: 16, lineHeight: 22, marginBottom: 15 },
  actionRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 15, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)', paddingTop: 10 }, actionBtn: { padding: 5 },
  recordBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#64748b', paddingVertical: 12, paddingHorizontal: 15, borderRadius: 10 },
  recordingActive: { backgroundColor: '#ef4444' }, audioPlayer: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.05)', padding: 10, borderRadius: 10, marginBottom: 15 }
});