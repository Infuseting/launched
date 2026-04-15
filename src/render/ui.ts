import { state } from "../state";

export function toggleServerSelection(show: boolean) {
  const overlay = document.getElementById('overlayContainer');
  if (!overlay) return;
  if (show) {
    document.querySelectorAll('.serverListing').forEach(btn => {
      const idx = parseInt((btn as HTMLElement).dataset.index!);
      if (idx === state.activeSessionIndex) {
        btn.setAttribute('selected', '');
      } else {
        btn.removeAttribute('selected');
      }
    });
    overlay.style.display = 'flex';
  } else {
    overlay.style.display = 'none';
  }
}

export function toggleSettings(show: boolean) {
  state.isSettingsOpen = show;
}

export function updateUserDisplay() {
  const userText = document.getElementById('user_text');
  if (userText) {
    userText.textContent = state.authCache ? state.authCache.name : 'No Account Selected';
  }
  const avatarContainer = document.getElementById('avatarContainer');
  if (avatarContainer) {
    avatarContainer.style.backgroundImage = state.authCache ? `url('https://mc-heads.net/body/${state.authCache.uuid}/right')` : 'none';
  }
}

export function updateMicrosoftStatus(isOk: boolean) {
  const icon = document.getElementById('ms_status_icon');
  if (icon) {
    icon.style.color = isOk ? '#4caf50' : '#f44336';
  }
}

export function updateServerButton() {
  const btn = document.getElementById('server_selection_button');
  if (btn && state.globalSessions.length > 0) {
    btn.innerHTML = '&#8226; ' + state.globalSessions[state.activeSessionIndex].name;
  }
}

export function resetLaunchArea() {
  const launchContent = document.getElementById('launch_content');
  const launchDetails = document.getElementById('launch_details');
  if (launchContent) launchContent.style.display = 'inline-flex';
  if (launchDetails) launchDetails.style.display = 'none';
}
