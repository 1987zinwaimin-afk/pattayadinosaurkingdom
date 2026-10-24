(() => {
  const ownerTab=document.getElementById('ownerModeTab');
  const staffTab=document.getElementById('staffModeTab');
  const ownerPanel=document.getElementById('ownerLoginPanel');
  const staffPanel=document.getElementById('staffLoginPanel');
  const title=document.getElementById('ownerAuthTitle');
  const intro=document.getElementById('loginIntro');
  const authStatus=document.getElementById('authStatus');
  const ownerForm=document.getElementById('ownerLoginForm');
  const staffForm=document.getElementById('checkinForm');
  if(!ownerTab||!staffTab||!ownerPanel||!staffPanel)return;
  function selectMode(mode){
    const staff=mode==='staff';
    ownerPanel.hidden=staff;
    staffPanel.hidden=!staff;
    ownerTab.classList.toggle('is-active',!staff);
    staffTab.classList.toggle('is-active',staff);
    ownerTab.setAttribute('aria-selected',String(!staff));
    staffTab.setAttribute('aria-selected',String(staff));
    title.textContent=staff?'Welcome Back':'Welcome Back';
    intro.textContent=staff?'Sign in with your assigned staff details.':'Sign in to Pattaya Dinosaur Kingdom Ticket Desk.';
    document.body.classList.toggle('staff-mode-active',staff);
    if(authStatus)authStatus.hidden=staff;
    if(!staff){ownerForm?.querySelector('input')?.focus({preventScroll:true});}
    else{document.getElementById('staffName')?.focus({preventScroll:true});}
  }
  ownerTab.addEventListener('click',()=>selectMode('owner'));
  staffTab.addEventListener('click',()=>selectMode('staff'));
  selectMode('owner');
})();
