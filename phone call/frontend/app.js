```javascript
const emailInput = document.querySelector('#emailInput');
const clearButton = document.querySelector('#clearButton');
const dialForm = document.querySelector('#dialForm');
const callModal = document.querySelector('#callModal');
const modalName = document.querySelector('#modalName');
const modalEmail = document.querySelector('#modalEmail');
const modalAvatar = document.querySelector('#modalAvatar');
const callStatus = document.querySelector('#callStatus');
const modalHint = document.querySelector('#modalHint');
const endCall = document.querySelector('#endCall');
const muteButton = document.querySelector('#muteButton');
const speakerButton = document.querySelector('#speakerButton');
const toast = document.querySelector('#toast');
const recentList = document.querySelector('#recentList');
const emptyRecent = document.querySelector('#emptyRecent');
const historyStatus = document.querySelector('#historyStatus');
const historyPanel = document.querySelector('#historyPanel');
const historyPanelTitle = document.querySelector('#historyPanelTitle');
const historyItems = document.querySelector('#historyItems');

let callTimer;
let lastKey;
let lastKeyAt = 0;

let selfEmail =
  localStorage.getItem('relayAccount') ||
  new URLSearchParams(window.location.search).get('email')?.toLowerCase() ||
  'jordan.reed@gmail.com';

const remoteAudio = document.querySelector('#remoteAudio');

let socket;
let peerConnection;
let localStream;
let currentPeer;
let caller = false;

function sendSignal(message) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function registerIdentity(email) {
  selfEmail = email.toLowerCase();

  document.querySelector('#profileEmail').textContent = selfEmail;

  document.querySelector('#profileName').textContent =
    selfEmail
      .split('@')[0]
      .replace(/[._-]/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());

  sendSignal({
    type: 'register',
    email: selfEmail
  });

  showToast(`Calling identity: ${selfEmail}`);
}

async function preparePeer(remoteEmail) {
  currentPeer = remoteEmail;

  peerConnection = new RTCPeerConnection({
    iceServers: [
      {
        urls: 'stun:stun.l.google.com:19302'
      }
    ]
  });

  peerConnection.onicecandidate = ({ candidate }) => {
    if (candidate) {
      sendSignal({
        type: 'signal',
        to: currentPeer,
        data: {
          candidate
        }
      });
    }
  };

  peerConnection.ontrack = ({ streams }) => {
    remoteAudio.srcObject = streams[0];
  };

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true
    });

    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });
  } catch {
    modalHint.textContent = 'Microphone permission is required';
    showToast('Allow microphone access to call');
  }
}

function connectSignaling() {
  // Render backend WebSocket connection
  socket = new WebSocket('wss://relay-call.onrender.com');

  socket.addEventListener('open', () => {
    sendSignal({
      type: 'register',
      email: selfEmail
    });
  });

  socket.addEventListener('message', async ({ data }) => {
    const message = JSON.parse(data);

    if (message.type === 'unavailable') {
      closeCall(false);
      showToast(`${message.to} is not online`);
      return;
    }

    if (message.type === 'call') {
      caller = false;

      await preparePeer(message.from);

      startCall(
        message.name,
        message.from,
        false
      );

      sendSignal({
        type: 'ready',
        to: message.from
      });
    }

    if (message.type === 'ready' && caller) {
      const offer = await peerConnection.createOffer();

      await peerConnection.setLocalDescription(offer);

      sendSignal({
        type: 'signal',
        to: currentPeer,
        data: {
          description: peerConnection.localDescription
        }
      });
    }

    if (message.type === 'signal' && peerConnection) {
      if (message.data.description?.type === 'offer') {
        await peerConnection.setRemoteDescription(
          message.data.description
        );

        const answer = await peerConnection.createAnswer();

        await peerConnection.setLocalDescription(answer);

        sendSignal({
          type: 'signal',
          to: message.from,
          data: {
            description: peerConnection.localDescription
          }
        });

        callStatus.textContent = 'Connected';
        modalHint.textContent = 'Live audio connection';
      } else if (message.data.description?.type === 'answer') {
        await peerConnection.setRemoteDescription(
          message.data.description
        );

        callStatus.textContent = 'Connected';
        modalHint.textContent = 'Live audio connection';
      } else if (message.data.candidate) {
        await peerConnection.addIceCandidate(
          message.data.candidate
        );
      }
    }

    if (message.type === 'hangup') {
      closeCall(false);
    }
  });
}

connectSignaling();

document.querySelectorAll('.mode-button').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.mode-button').forEach((modeButton) => {
      const selected = modeButton === button;

      modeButton.classList.toggle(
        'selected',
        selected
      );

      modeButton.setAttribute(
        'aria-selected',
        selected
      );
    });

    const phoneMode =
      button.dataset.mode === 'phone';

    emailInput.type = phoneMode
      ? 'tel'
      : 'email';

    emailInput.placeholder = phoneMode
      ? '+1 (555) 000-0000'
      : 'name@gmail.com';

    document.querySelector(
      '.dial-display label'
    ).textContent = phoneMode
      ? 'Phone number'
      : 'Gmail address';

    document.querySelector(
      '.input-symbol'
    ).textContent = phoneMode
      ? '⌕'
      : '@';

    document.querySelector(
      '.eyebrow'
    ).lastChild.textContent = phoneMode
      ? ' PHONE NUMBERS'
      : ' GMAIL ADDRESSES';
  });
});

function initials(name) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function showToast(message) {
  toast.textContent = message;

  toast.classList.add('show');

  window.setTimeout(
    () => toast.classList.remove('show'),
    2500
  );
}

function startCall(
  name,
  email,
  sendRequest = true
) {
  if (sendRequest) {
    window.location.href =
      `/call.html?to=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`;

    return;
  }

  modalName.textContent = name;
  modalEmail.textContent = email;
  modalAvatar.textContent = initials(name);

  callStatus.textContent = 'Calling...';
  modalHint.textContent = 'Connecting securely';

  callModal.classList.add('open');

  callModal.setAttribute(
    'aria-hidden',
    'false'
  );

  if (sendRequest) {
    const calls = JSON.parse(
      localStorage.getItem(
        'relayCallHistory'
      ) || '[]'
    );

    calls.unshift({
      email,
      name,
      type: 'dialed',
      time: Date.now()
    });

    localStorage.setItem(
      'relayCallHistory',
      JSON.stringify(
        calls.slice(0, 50)
      )
    );

    updateHistoryStatus(
      document.querySelector(
        '.call-filter.selected'
      )?.dataset.filter || 'all'
    );
  }

  if (sendRequest) {
    caller = true;

    preparePeer(email).then(() =>
      sendSignal({
        type: 'call',
        to: email,
        name
      })
    );
  }
}

function closeCall(
  sendHangup = true
) {
  window.clearTimeout(callTimer);

  if (
    sendHangup &&
    currentPeer
  ) {
    sendSignal({
      type: 'hangup',
      to: currentPeer
    });
  }

  peerConnection?.close();

  localStream?.getTracks().forEach(
    (track) => track.stop()
  );

  peerConnection = null;
  localStream = null;
  currentPeer = null;

  callModal.classList.remove('open');

  callModal.setAttribute(
    'aria-hidden',
    'true'
  );

  showToast('Call ended');
}

dialForm.addEventListener(
  'submit',
  (event) => {
    event.preventDefault();

    const email =
      emailInput.value
        .trim()
        .toLowerCase();

    const phoneMode =
      document.querySelector(
        '.mode-button.selected'
      ).dataset.mode === 'phone';

    if (phoneMode) {
      showToast(
        'Phone mode is reserved for a future connection'
      );

      return;
    }

    if (!email.endsWith('@gmail.com')) {
      showToast(
        'Search with a valid Gmail address'
      );

      emailInput.focus();

      return;
    }

    const name =
      email
        .split('@')[0]
        .split(/[._-]/)
        .map(
          (part) =>
            part.charAt(0).toUpperCase() +
            part.slice(1)
        )
        .join(' ');

    showToast(`Searching ${email}`);

    startCall(name, email);
  }
);

document
  .querySelectorAll('[data-email]')
  .forEach((button) => {
    button.addEventListener(
      'click',
      () =>
        startCall(
          button.dataset.name,
          button.dataset.email
        )
    );
  });

clearButton.addEventListener(
  'click',
  () => {
    emailInput.value = '';
    emailInput.focus();
  }
);

endCall.addEventListener(
  'click',
  closeCall
);

callModal.addEventListener(
  'click',
  (event) => {
    if (event.target === callModal) {
      closeCall();
    }
  }
);

[muteButton, speakerButton].forEach(
  (button) => {
    button.addEventListener(
      'click',
      () => {
        button.classList.toggle(
          'active'
        );

        showToast(
          button.classList.contains('active')
            ? `${button.getAttribute('aria-label')} on`
            : `${button.getAttribute('aria-label')} off`
        );
      }
    );
  }
);

document
  .querySelectorAll('.call-filter')
  .forEach((filterButton) => {
    filterButton.addEventListener(
      'click',
      () => {
        const filter =
          filterButton.dataset.filter;

        document
          .querySelectorAll('.call-filter')
          .forEach((button) => {
            const selected =
              button === filterButton;

            button.classList.toggle(
              'selected',
              selected
            );

            button.setAttribute(
              'aria-selected',
              selected
            );
          });

        updateHistoryStatus(filter);
        renderHistory(filter);
      }
    );
  });

function updateHistoryStatus(filter) {
  const calls = JSON.parse(
    localStorage.getItem(
      'relayCallHistory'
    ) || '[]'
  );

  const matchingCalls =
    filter === 'all'
      ? calls
      : calls.filter(
          (call) =>
            call.type === filter
        );

  historyStatus.textContent =
    matchingCalls.length
      ? `${matchingCalls.length} ${
          filter === 'all'
            ? 'recent'
            : filter
        } call${
          matchingCalls.length === 1
            ? ''
            : 's'
        }`
      : `No ${
          filter === 'all'
            ? 'recent'
            : filter
        } calls yet`;
}

function renderHistory(filter) {
  const calls = JSON.parse(
    localStorage.getItem(
      'relayCallHistory'
    ) || '[]'
  );

  const matchingCalls =
    filter === 'all'
      ? calls
      : calls.filter(
          (call) =>
            call.type === filter
        );

  historyPanel.hidden = false;

  historyPanelTitle.textContent =
    document.querySelector(
      `.call-filter[data-filter="${filter}"]`
    ).textContent;

  historyItems.innerHTML =
    matchingCalls.length
      ? matchingCalls
          .map(
            (call) =>
              `<div class="history-entry">
                <span class="history-avatar">${initials(call.name)}</span>
                <span>
                  <strong>${call.name}</strong>
                  <small>${call.email}</small>
                </span>
                <time>${new Date(
                  call.time
                ).toLocaleTimeString([], {
                  hour: 'numeric',
                  minute: '2-digit'
                })}</time>
              </div>`
          )
          .join('')
      : '<p class="history-empty">No calls in this section yet.</p>';
}

document
  .querySelector('#closeHistory')
  .addEventListener(
    'click',
    () => {
      historyPanel.hidden = true;
    }
  );

updateHistoryStatus('all');

document.addEventListener(
  'keydown',
  (event) => {
    if (
      event.key === 'Escape' &&
      callModal.classList.contains('open')
    ) {
      closeCall();
    }
  }
);

const authModal =
  document.querySelector('#authModal');

const authForm =
  document.querySelector('#authForm');

const authTitle =
  document.querySelector('#authTitle');

const authSubtitle =
  document.querySelector('#authSubtitle');

const authSubmit =
  document.querySelector('#authSubmit');

const authPassword =
  document.querySelector('#authPassword');

const passwordLabel =
  document.querySelector('#passwordLabel');

const rememberRow =
  document.querySelector('#rememberRow');

const savedList =
  document.querySelector('#savedList');

const savedCount =
  document.querySelector('#savedCount');

let authView = 'login';

function savedGmails() {
  return JSON.parse(
    localStorage.getItem(
      'relayGmails'
    ) || '[]'
  );
}

async function passwordHash(password) {
  const bytes =
    new TextEncoder().encode(
      password
    );

  const digest =
    await crypto.subtle.digest(
      'SHA-256',
      bytes
    );

  return [
    ...new Uint8Array(digest)
  ]
    .map(
      (byte) =>
        byte
          .toString(16)
          .padStart(2, '0')
    )
    .join('');
}

function rememberGmail(email) {
  const contacts = [
    ...new Set([
      email,
      ...savedGmails()
    ])
  ].slice(0, 12);

  localStorage.setItem(
    'relayGmails',
    JSON.stringify(contacts)
  );

  renderSavedGmails();
}

function renderSavedGmails() {
  const contacts =
    savedGmails();

  savedCount.textContent =
    contacts.length;

  savedList.innerHTML =
    contacts.length
      ? contacts
          .map(
            (email) =>
              `<button class="saved-contact" data-saved-email="${email}">
                <span>${email}</span>
                <span>Call ↗</span>
              </button>`
          )
          .join('')
      : '<small>No saved Gmail contacts yet.</small>';

  savedList
    .querySelectorAll(
      '[data-saved-email]'
    )
    .forEach((button) =>
      button.addEventListener(
        'click',
        () => {
          const email =
            button.dataset.savedEmail;

          startCall(
            email
              .split('@')[0]
              .replace(
                /[._-]/g,
                ' '
              ),
            email
          );
        }
      )
    );
}

function setAuthView(view) {
  authView = view;

  document
    .querySelectorAll('.auth-tab')
    .forEach((tab) =>
      tab.classList.toggle(
        'selected',
        tab.dataset.authView ===
          view
      )
    );

  const forgot =
    view === 'forgot';

  authTitle.textContent =
    view === 'signup'
      ? 'Create your account'
      : forgot
        ? 'Reset your password'
        : 'Welcome back';

  authSubtitle.textContent =
    view === 'signup'
      ? 'Create a relay identity and keep your Gmail contacts ready to call.'
      : forgot
        ? 'Enter your email and we will send reset instructions.'
        : 'Sign in to remember your Gmail contacts across calls.';

  authSubmit.innerHTML =
    `${
      view === 'signup'
        ? 'Create account'
        : forgot
          ? 'Send reset link'
          : 'Log in'
    } <span>↗</span>`;

  authPassword.required =
    !forgot;

  authPassword.hidden =
    forgot;

  passwordLabel.hidden =
    forgot;

  rememberRow.hidden =
    forgot;
}

document
  .querySelector('#profileButton')
  .addEventListener(
    'click',
    () => {
      authModal.classList.add(
        'open'
      );

      authModal.setAttribute(
        'aria-hidden',
        'false'
      );

      renderSavedGmails();
    }
  );

document
  .querySelector('#authClose')
  .addEventListener(
    'click',
    () => {
      authModal.classList.remove(
        'open'
      );

      authModal.setAttribute(
        'aria-hidden',
        'true'
      );
    }
  );

authModal.addEventListener(
  'click',
  (event) => {
    if (
      event.target === authModal
    ) {
      document
        .querySelector(
          '#authClose'
        )
        .click();
    }
  }
);

document
  .querySelectorAll('.auth-tab')
  .forEach((tab) =>
    tab.addEventListener(
      'click',
      () =>
        setAuthView(
          tab.dataset.authView
        )
    )
  );

authForm.addEventListener(
  'submit',
  async (event) => {
    event.preventDefault();

    const email =
      document
        .querySelector(
          '#authEmail'
        )
        .value
        .trim()
        .toLowerCase();

    if (authView === 'forgot') {
      showToast(
        `Reset instructions sent to ${email}`
      );

      return;
    }

    if (!email.endsWith('@gmail.com')) {
      showToast(
        'Use a Gmail address for your relay account'
      );

      return;
    }

    const accounts =
      JSON.parse(
        localStorage.getItem(
          'relayAccounts'
        ) || '{}'
      );

    const password =
      authPassword.value;

    const hash =
      await passwordHash(
        password
      );

    if (authView === 'signup') {
      if (accounts[email]) {
        showToast(
          'Account already exists. Log in instead'
        );

        return;
      }

      accounts[email] = {
        passwordHash: hash
      };

      localStorage.setItem(
        'relayAccounts',
        JSON.stringify(
          accounts
        )
      );
    } else if (
      !accounts[email] ||
      accounts[email].passwordHash !==
        hash
    ) {
      showToast(
        'Gmail or password is incorrect'
      );

      return;
    }

    registerIdentity(email);

    if (
      document.querySelector(
        '#rememberMe'
      ).checked
    ) {
      localStorage.setItem(
        'relayAccount',
        email
      );
    } else {
      localStorage.removeItem(
        'relayAccount'
      );
    }

    rememberGmail(email);

    showToast(
      authView === 'signup'
        ? 'Account created'
        : 'Signed in'
    );

    document
      .querySelector(
        '#authClose'
      )
      .click();
  }
);

renderSavedGmails();

if (
  new URLSearchParams(
    window.location.search
  ).get('auth') === 'login'
) {
  authModal.classList.add(
    'open'
  );

  authModal.setAttribute(
    'aria-hidden',
    'false'
  );
}
```
