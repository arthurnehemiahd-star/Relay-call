const contactForm = document.querySelector('#contactForm');
const contactsList = document.querySelector('#contactsList');
const contactCount = document.querySelector('#contactCount');
const toast = document.querySelector('#toast');

function getContacts() { return JSON.parse(localStorage.getItem('relayContacts') || '[]'); }
function showToast(message) { toast.textContent = message; toast.classList.add('show'); window.setTimeout(() => toast.classList.remove('show'), 2200); }
function renderContacts() {
  const contacts = getContacts();
  contactCount.textContent = contacts.length;
  contactsList.innerHTML = contacts.length ? contacts.map((contact, index) => `<div class="contact-record"><span class="contact-record-avatar">${contact.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span><span class="contact-record-copy"><strong>${contact.name}</strong><small>${contact.email}</small></span><button class="contact-call" data-contact-email="${contact.email}" data-contact-name="${contact.name}">Call</button><button class="contact-remove" data-contact-index="${index}" aria-label="Remove ${contact.name}">×</button></div>`).join('') : '<p class="contacts-empty">No contacts saved yet.</p>';
  contactsList.querySelectorAll('.contact-call').forEach((button) => button.addEventListener('click', () => { window.location.href = `/call.html?to=${encodeURIComponent(button.dataset.contactEmail)}&name=${encodeURIComponent(button.dataset.contactName)}`; }));
  contactsList.querySelectorAll('.contact-remove').forEach((button) => button.addEventListener('click', () => { const contacts = getContacts(); contacts.splice(Number(button.dataset.contactIndex), 1); localStorage.setItem('relayContacts', JSON.stringify(contacts)); renderContacts(); }));
}
contactForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = document.querySelector('#contactName').value.trim();
  const email = document.querySelector('#contactEmail').value.trim().toLowerCase();
  if (!email.endsWith('@gmail.com')) { showToast('Enter a valid Gmail address'); return; }
  const contacts = getContacts().filter((contact) => contact.email !== email);
  contacts.unshift({ name, email });
  localStorage.setItem('relayContacts', JSON.stringify(contacts));
  contactForm.reset();
  renderContacts();
  showToast('Contact saved');
});
renderContacts();
