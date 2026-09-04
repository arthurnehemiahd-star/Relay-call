const params = new URLSearchParams(window.location.search);
const targetEmail = (params.get('to') || '').toLowerCase();
const selfEmail = localStorage.getItem('relayAccount') || params.get('from') || 'jordan.reed@gmail.com';
const displayName = params.get('name') || targetEmail.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) || 'Relay user';
const callStatus = document.querySelector('#callStatus');
const callHint = document.querySelector('#callHint');
const callActions = document.querySelector('#callActions');
const answerButton = document.querySelector('#answerButton');
const remoteAudio = document.querySelector('#remoteAudio');
const remoteVideo = document.querySelector('#remoteVideo');
const localVideo = document.querySelector('#localVideo');
let socket;
let peerConnection;
let localStream;

function signal(message) { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); }
async function setupPeer(remoteEmail) {
  peerConnection = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  peerConnection.onicecandidate = ({ candidate }) => { if (candidate) signal({ type: 'signal', to: remoteEmail, data: { candidate } }); };
  peerConnection.ontrack = ({ streams }) => { remoteAudio.srcObject = streams[0]; remoteVideo.srcObject = streams[0]; };
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));
    callHint.textContent = 'Microphone ready';
  } catch { callHint.textContent = 'Allow microphone access to talk'; }
}
function endCall() {
  if (targetEmail) signal({ type: 'hangup', to: targetEmail });
  peerConnection?.close();
  localStream?.getTracks().forEach((track) => track.stop());
  window.location.href = '/';
}
function showConnected() {
  callStatus.textContent = 'Connected';
  callHint.textContent = 'Live audio connection';
  callActions.hidden = false;
  answerButton.hidden = true;
}

if (targetEmail) {
  document.querySelector('#callAvatar').textContent = displayName.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  document.querySelector('#callName').textContent = displayName;
  document.querySelector('#callEmail').textContent = targetEmail;
  const calls = JSON.parse(localStorage.getItem('relayCallHistory') || '[]');
  calls.unshift({ email: targetEmail, name: displayName, type: 'dialed', time: Date.now() });
  localStorage.setItem('relayCallHistory', JSON.stringify(calls.slice(0, 50)));
}
socket = new WebSocket(`ws://${window.location.host}`);
socket.addEventListener('open', async () => {
  signal({ type: 'register', email: selfEmail });
  if (targetEmail) { await setupPeer(targetEmail); signal({ type: 'call', to: targetEmail, name: selfEmail }); }
});
socket.addEventListener('message', async ({ data }) => {
  const message = JSON.parse(data);
  if (message.type === 'unavailable') { callStatus.textContent = 'Unavailable'; callHint.textContent = 'That Gmail user is not online'; return; }
  if (message.type === 'ready') {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    signal({ type: 'signal', to: targetEmail, data: { description: peerConnection.localDescription } });
  }
  if (message.type === 'signal' && peerConnection) {
    if (message.data.description?.type === 'offer') {
      await peerConnection.setRemoteDescription(message.data.description);
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      signal({ type: 'signal', to: message.from, data: { description: peerConnection.localDescription } });
      showConnected();
    } else if (message.data.description?.type === 'answer') {
      await peerConnection.setRemoteDescription(message.data.description);
      showConnected();
    } else if (message.data.candidate) await peerConnection.addIceCandidate(message.data.candidate);
  }
  if (message.type === 'hangup') endCall();
});
document.querySelector('#endCall').addEventListener('click', endCall);
answerButton.addEventListener('click', showConnected);
document.querySelector('#muteButton').addEventListener('click', (event) => { localStream?.getAudioTracks().forEach((track) => { track.enabled = !track.enabled; event.currentTarget.classList.toggle('active', !track.enabled); }); });
document.querySelector('#speakerButton').addEventListener('click', () => { remoteAudio.muted = !remoteAudio.muted; document.querySelector('#speakerButton').classList.toggle('active', remoteAudio.muted); });
const addParticipant = document.querySelector('#addParticipant');
const participantEmail = document.querySelector('#participantEmail');
const participantList = document.querySelector('#participantList');
document.querySelector('#addCallButton').addEventListener('click', () => { addParticipant.hidden = !addParticipant.hidden; if (!addParticipant.hidden) participantEmail.focus(); });
document.querySelector('#inviteParticipant').addEventListener('click', () => {
  const email = participantEmail.value.trim().toLowerCase();
  if (!email.endsWith('@gmail.com')) { callHint.textContent = 'Enter a valid Gmail address'; return; }
  signal({ type: 'call', to: email, name: selfEmail });
  const chip = document.createElement('span');
  chip.className = 'participant-chip';
  chip.textContent = email;
  participantList.appendChild(chip);
  participantEmail.value = '';
  callHint.textContent = `Invitation sent to ${email}`;
});
document.querySelector('#videoButton').addEventListener('click', async (event) => {
  if (!peerConnection || !localStream) { callHint.textContent = 'Connect the call before starting video'; return; }
  try {
    const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
    videoStream.getVideoTracks().forEach((track) => peerConnection.addTrack(track, videoStream));
    localVideo.srcObject = videoStream;
    event.currentTarget.classList.add('active');
    remoteVideo.hidden = false;
    localVideo.hidden = false;
    document.body.classList.add('video-active');
    callHint.textContent = 'Video call enabled';
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    signal({ type: 'signal', to: targetEmail, data: { description: peerConnection.localDescription } });
  } catch { callHint.textContent = 'Allow camera access to start video'; }
});
document.querySelector('#contactsButton').addEventListener('click', () => { callHint.textContent = 'Contacts are available from the dialer'; });
