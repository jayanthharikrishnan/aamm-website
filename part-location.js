/* Generic educational assembly diagrams. These are not fitment or fitting instructions. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PartLocation = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  let nextId = 0;
  const dictionary = {
    heading: ['Where does this part go?', 'இந்த பாகம் எங்கே பொருத்தப்படுகிறது?'],
    hint: ['Open the location guide', 'பாகத்தின் இடத்தைக் காண்க'],
    starter: ['Starter motor', 'ஸ்டார்டர் மோட்டார்'],
    alternator: ['Alternator', 'ஆல்டர்னேட்டர்'],
    play: ['Play animation', 'இயக்கிக் காண்க'],
    pause: ['Pause', 'இடைநிறுத்து'],
    resume: ['Continue', 'தொடரவும்'],
    replay: ['Replay', 'மீண்டும் இயக்கு'],
    show: ['Show position', 'இடத்தைக் காட்டு'],
    ready: ['Play to see the highlighted part move into its typical assembly position.', 'பாகம் பொதுவாக அமையும் இடத்தைக் காண இயக்கவும்.'],
    running: ['Moving the highlighted part into the assembly.', 'குறிப்பிட்ட பாகம் அமைப்பில் அமையும் இடம் காட்டப்படுகிறது.'],
    paused: ['Animation paused.', 'அசைவுப் படம் இடைநிறுத்தப்பட்டுள்ளது.'],
    finished: ['The highlight shows the typical position of this component.', 'குறிப்பிட்ட பாகம் பொதுவாக அமையும் இடம் காட்டப்பட்டுள்ளது.'],
    reduced: ['Position shown without motion to match your reduced-motion preference.', 'குறைந்த அசைவு விருப்பத்திற்கேற்ப, பாகத்தின் இடம் அசைவு இல்லாமல் காட்டப்பட்டுள்ளது.'],
    note: ['Typical assembly only. Exact layout varies by model; confirm your part and vehicle with Alagar Automobiles before fitting.', 'இது பொதுவான அமைப்பு விளக்கம் மட்டுமே. வாகன மாதிரிக்கு ஏற்ப அமைப்பு மாறும். பொருத்துவதற்கு முன் அழகர் ஆட்டோமொபைல்ஸ் குழுவுடன் உறுதி செய்யுங்கள்.'],
    drive: ['Drive end', 'இயக்க முனை'],
    electrical: ['Electrical end', 'மின் இணைப்பு முனை'],
    unknownTitle: ['Exact position needs confirmation', 'துல்லியமான இடத்தை உறுதி செய்ய வேண்டும்'],
    unknown: ['This catalogue label does not confirm the exact assembly position. We will not guess where it fits. Share your vehicle and part number with our team for a location guide.', 'இந்தப் பட்டியல் பெயர் பாகத்தின் துல்லியமான இடத்தை உறுதி செய்யவில்லை. ஊகத்தின் அடிப்படையில் பொருத்தும் இடத்தைக் காட்ட முடியாது. வாகன விவரங்கள் மற்றும் பாகத்தின் எண்ணை எங்கள் குழுவுடன் பகிருங்கள்.'],
    contact: ['Ask about this part', 'இந்த பாகம் பற்றி விசாரிக்கவும்'],
    generic: ['Educational schematic', 'விளக்கத்திற்கான வரைபடம்'],
  };
  const positions = {
    'alternator:rotor': {
      key: 'rotor', label: ['Rotor', 'ரோட்டர்'], point: [300, 174],
      description: ['The rotor turns on the central shaft, inside the stationary stator.', 'நிலையாக இருக்கும் ஸ்டேட்டரின் உள்ளே, மையத் தண்டில் ரோட்டர் சுழல்கிறது.'],
    },
    'alternator:stator': {
      key: 'stator', label: ['Stator', 'ஸ்டேட்டர்'], point: [300, 174],
      description: ['The stator stays fixed around the rotor, inside the alternator housing.', 'ஆல்டர்னேட்டர் உடலின் உள்ளே, ரோட்டரைச் சுற்றி ஸ்டேட்டர் நிலையாக அமைகிறது.'],
    },
    'alternator:housing': {
      key: 'housing', label: ['Housing', 'வெளிப்புற உறை'], point: [300, 174],
      description: ['The housing is the outer enclosure supporting the alternator assembly.', 'ஆல்டர்னேட்டர் அமைப்பைத் தாங்கும் வெளிப்புற உறையே ஹவுசிங் ஆகும்.'],
    },
    'alternator:pulley': {
      key: 'pulley', label: ['Pulley', 'புல்லி'], point: [142, 174],
      description: ['The pulley is on the external drive end of the rotor shaft, where the belt drives the alternator.', 'பெல்ட் மூலம் ஆல்டர்னேட்டரை இயக்கும் புல்லி, ரோட்டர் தண்டின் வெளிப்புற இயக்க முனையில் அமைகிறது.'],
    },
    'alternator:brush': {
      key: 'brush', label: ['Brush', 'பிரஷ்'], point: [401, 174],
      description: ['In a typical slip-ring alternator, the brushes contact the rotor slip rings at the electrical end.', 'பொதுவான ஸ்லிப் ரிங் ஆல்டர்னேட்டரில், மின் இணைப்பு முனையில் உள்ள ரோட்டர் ஸ்லிப் ரிங்குகளை பிரஷ்கள் தொடுகின்றன.'],
    },
    'alternator:brush holder': {
      key: 'brush-holder', label: ['Brush holder', 'பிரஷ் ஹோல்டர்'], point: [401, 174],
      description: ['The brush holder supports the brushes beside the rotor slip rings. This view shows a typical electrical-end arrangement.', 'ரோட்டர் ஸ்லிப் ரிங்குகளுக்கு அருகில் பிரஷ்களை ஹோல்டர் தாங்குகிறது. இங்கு பொதுவான மின் இணைப்பு முனை அமைப்பு காட்டப்படுகிறது.'],
    },
    'starter:armature': {
      key: 'armature', label: ['Armature', 'ஆர்மேச்சர்'], point: [300, 174],
      description: ['The armature is the rotating core on the central shaft of the starter motor.', 'ஸ்டார்டர் மோட்டாரின் மையத் தண்டில் சுழலும் பகுதியே ஆர்மேச்சர் ஆகும்.'],
    },
    'starter:coil': {
      key: 'coil', label: ['Field coil', 'ஃபீல்டு காயில்'], point: [300, 174],
      description: ['In a field-wound starter, the field coils sit inside the housing around the armature. Other starter designs use a different arrangement.', 'ஃபீல்டு காயில் உள்ள ஸ்டார்டரில், ஆர்மேச்சரைச் சுற்றி உடலின் உள்ளே காயில்கள் அமையும். மற்ற வடிவமைப்புகளில் அமைப்பு மாறலாம்.'],
    },
    'starter:self brush': {
      key: 'brush', label: ['Starter brush', 'ஸ்டார்டர் பிரஷ்'], point: [401, 174],
      description: ['The brushes meet the armature commutator at the electrical end of a typical starter motor.', 'பொதுவான ஸ்டார்டர் மோட்டாரின் மின் இணைப்பு முனையில், ஆர்மேச்சர் கம்யூட்டேட்டரை பிரஷ்கள் தொடுகின்றன.'],
    },
    'starter:ben dex': {
      key: 'drive', label: ['Starter drive', 'ஸ்டார்டர் டிரைவ்'], point: [147, 174],
      description: ['The starter drive sits at the drive nose. Its pinion engages the engine flywheel ring gear when starting.', 'ஸ்டார்டர் டிரைவ் இயக்க முனையில் அமைகிறது. வாகனத்தை இயக்கும்போது இதன் பினியன், என்ஜின் ஃப்ளைவீல் ரிங் கியருடன் இணைகிறது.'],
    },
    'starter:solenoid switch': {
      key: 'solenoid', label: ['Solenoid switch', 'சோலனாய்டு சுவிட்ச்'], point: [278, 89],
      description: ['A typical starter solenoid sits outside the motor body and actuates the drive mechanism. Mounting differs between designs.', 'பொதுவான ஸ்டார்டர் சோலனாய்டு, மோட்டார் உடலுக்கு வெளியே இருந்து டிரைவ் அமைப்பை இயக்குகிறது. வடிவமைப்பிற்கு ஏற்ப பொருத்தும் இடம் மாறும்.'],
    },
    'starter:fork and bolt': {
      key: 'fork', label: ['Shift-fork area', 'ஷிஃப்ட் ஃபோர்க் பகுதி'], point: [186, 145],
      description: ['The shift fork links the solenoid mechanism to the starter drive. This marks the fork region; the bolt position is not specified.', 'சோலனாய்டு அமைப்பையும் ஸ்டார்டர் டிரைவையும் ஷிஃப்ட் ஃபோர்க் இணைக்கிறது. இங்கு ஃபோர்க் பகுதி மட்டுமே காட்டப்படுகிறது; போல்ட்டின் இடம் குறிப்பிடப்படவில்லை.'],
    },
    'starter:bush': {
      key: 'bush', label: ['Shaft support', 'தண்டு ஆதரவு'], point: [300, 174],
      description: ['Bushes support the shaft at support housings. Both support regions are highlighted because the correct end depends on the specific part and motor.', 'தண்டை ஆதரவு உறைகளில் புஷ்கள் தாங்குகின்றன. குறிப்பிட்ட பாகம் மற்றும் மோட்டாருக்கு ஏற்ப சரியான முனை மாறுவதால், இரு ஆதரவு பகுதிகளும் காட்டப்படுகின்றன.'],
    },
  };
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function describePart(product = {}) {
    const category = String(product.category || '').trim().toLowerCase();
    const subcategory = String(product.subcategory || '').trim().toLowerCase();
    const assembly = category.includes('alternator') || category.includes('dynamo') ? 'alternator' : category === 'self motor' || category === 'starter motor' ? 'starter' : null;
    const position = assembly ? positions[`${assembly}:${subcategory}`] : null;
    return { supported: Boolean(position), assembly, position: position || null };
  }
  function focusShape(key, extra = '') {
    const attrs = `class="pl-component ${extra}"`;
    if (key === 'rotor' || key === 'armature') return `<g ${attrs}><rect x="247" y="149" width="106" height="50" rx="11"/><path d="M224 174h153M263 153v42m18-42v42m18-42v42m18-42v42m18-42v42"/></g>`;
    if (key === 'stator' || key === 'coil') return `<g ${attrs}><path d="M211 142q0-16 18-16h142q18 0 18 16v16H211ZM211 190h178v16q0 16-18 16H229q-18 0-18-16Z"/><path d="M229 130v24m20-24v24m20-24v24m20-24v24m20-24v24m20-24v24m20-24v24m20-24v24M229 194v24m20-24v24m20-24v24m20-24v24m20-24v24m20-24v24m20-24v24m20-24v24"/></g>`;
    if (key === 'housing') return `<g ${attrs}><rect x="174" y="111" width="252" height="126" rx="28"/><path d="M194 120v108m212-108v108M219 118h155M219 230h155"/></g>`;
    if (key === 'pulley') return `<g ${attrs}><rect x="125" y="145" width="34" height="58" rx="6"/><path d="M134 146v56m15-56v56M119 174h46"/></g>`;
    if (key === 'brush') return `<g ${attrs}><rect x="390" y="145" width="21" height="19" rx="2"/><rect x="390" y="184" width="21" height="19" rx="2"/><path d="M400 164v9m0 2v9m10-32 15-10m-15 53 15 10"/></g>`;
    if (key === 'brush-holder') return `<g ${attrs}><path d="M383 139h34v70h-34v-26h10v-18h-10Z"/><rect x="390" y="145" width="21" height="19" rx="2"/><rect x="390" y="184" width="21" height="19" rx="2"/></g>`;
    if (key === 'drive') return `<g ${attrs}><rect x="126" y="154" width="44" height="40" rx="5"/><path d="M118 157h10m-10 10h10m-10 14h10m-10 10h10M139 156v36m12-36v36m12-36v36"/></g>`;
    if (key === 'solenoid') return `<g ${attrs}><rect x="223" y="69" width="111" height="40" rx="13"/><path d="M211 89h12m111 0h15m-95 20v15m47-15v15M257 69v-9m32 9v-9"/></g>`;
    if (key === 'fork') return `<g ${attrs}><path d="m195 110-17 49m0 0-17 27m17-27 17 27M190 125l13 5" stroke-width="7"/><circle cx="178" cy="159" r="7"/></g>`;
    if (key === 'bush') return `<g ${attrs}><rect x="180" y="162" width="17" height="24" rx="4"/><rect x="402" y="162" width="17" height="24" rx="4"/><path d="M180 174h17m205 0h17"/></g>`;
    return '';
  }
  function assemblySvg(assembly, position, id, text) {
    const shell = `<g class="pl-context"><path d="M107 174h347"/><rect x="174" y="111" width="252" height="126" rx="28"/><path d="M198 118v112m205-112v112"/><rect x="247" y="149" width="106" height="50" rx="11"/><path d="M211 139h178m-178 70h178M263 153v42m18-42v42m18-42v42m18-42v42m18-42v42"/><rect x="180" y="162" width="17" height="24" rx="4"/><rect x="402" y="162" width="17" height="24" rx="4"/>${assembly === 'starter' ? '<path d="m195 110-17 49-17 27m17-27 17 27"/><rect x="223" y="69" width="111" height="40" rx="13"/><path d="M254 109v15m47-15v15"/><rect x="126" y="154" width="44" height="40" rx="5"/><path d="M118 157h10m-10 10h10m-10 14h10m-10 10h10"/>' : '<rect x="125" y="145" width="34" height="58" rx="6"/><path d="M134 146v56m15-56v56"/><rect x="390" y="145" width="21" height="19" rx="2"/><rect x="390" y="184" width="21" height="19" rx="2"/>'}</g>`;
    return `<svg viewBox="0 0 560 290" role="img" aria-labelledby="${id}-title ${id}-desc"><title id="${id}-title">${escape(text(position.label))} · ${escape(text(dictionary[assembly]))}</title><desc id="${id}-desc">${escape(text(position.description))} ${escape(text(dictionary.note))}</desc>${shell}<g class="pl-target" aria-hidden="true">${focusShape(position.key)}</g><g class="pl-moving" data-moving aria-hidden="true">${focusShape(position.key)}</g><g class="pl-end-labels" aria-hidden="true"><path d="M139 243v13h55M414 243v13h-55"/><text x="139" y="274" text-anchor="middle">${escape(text(dictionary.drive))}</text><text x="414" y="274" text-anchor="middle">${escape(text(dictionary.electrical))}</text></g></svg>`;
  }
  function mount(container, product = {}, options = {}) {
    if (!container || typeof document === 'undefined') return () => {};
    if (container._partLocationCleanup) container._partLocationCleanup();
    const language = options.language === 'ta' ? 1 : 0;
    const text = pair => pair[language];
    const guide = describePart(product);
    const id = `part-location-${++nextId}`;
    const heading = escape(text(dictionary.heading));
    const inquiry = new URL('https://wa.me/919344898473');
    inquiry.searchParams.set('text', language ? `வணக்கம் அழகர் ஆட்டோமொபைல்ஸ், ${product.display_name || product.name || 'இந்த பாகம்'} எங்கே அமைகிறது என்பதைத் தெரிந்து கொள்ள விரும்புகிறேன். பாகத்தின் எண் மற்றும் வாகனப் பொருத்தத்தை உறுதி செய்ய உதவுங்கள்.` : `Hello Alagar Automobiles, where does ${product.display_name || product.name || 'this part'} fit? Please help confirm the assembly location, part number and vehicle fitment.`);
    container.innerHTML = `<details class="part-location" id="${id}"><summary><span><strong>${heading}</strong><small>${escape(text(dictionary.hint))}</small></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></summary><div class="pl-content">${guide.supported ? `<h2 class="pl-title">${escape(text(guide.position.label))} <span>· ${escape(text(dictionary[guide.assembly]))}</span></h2><p class="pl-description">${escape(text(guide.position.description))}</p><figure class="pl-stage"><div class="pl-schematic-tag">${escape(text(dictionary.generic))}</div>${assemblySvg(guide.assembly, guide.position, id, text)}</figure><div class="pl-actions"><button type="button" class="pl-control pl-primary" data-play>${escape(text(dictionary.play))}</button></div><p class="pl-status" role="status" aria-live="polite" data-status>${escape(text(dictionary.ready))}</p><p class="pl-note">${escape(text(dictionary.note))}</p>` : `<h2 class="pl-title">${escape(text(dictionary.unknownTitle))}</h2><p class="pl-description">${escape(text(dictionary.unknown))}</p><a class="pl-contact" href="${escape(inquiry.toString())}" target="_blank" rel="noopener">${escape(text(dictionary.contact))}<span aria-hidden="true">↗</span></a>`}</div></details>`;
    const details = container.querySelector('details');
    let animation = null;
    let reduced;
    let visibility;
    let toggle;
    let mediaChange;
    if (guide.supported) {
      const moving = container.querySelector('[data-moving]');
      const play = container.querySelector('[data-play]');
      const status = container.querySelector('[data-status]');
      reduced = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
      let state = 'ready';
      const label = key => { play.textContent = text(dictionary[key]); };
      const setStatus = key => { status.textContent = text(dictionary[key]); };
      function showFinal(isReduced) {
        if (animation) { animation.cancel(); animation = null; }
        moving.style.opacity = '1';
        moving.style.transform = 'none';
        state = 'finished';
        label(isReduced ? 'show' : 'replay');
        setStatus(isReduced ? 'reduced' : 'finished');
      }
      function start() {
        if (reduced?.matches || typeof moving.animate !== 'function') { showFinal(Boolean(reduced?.matches)); return; }
        animation?.cancel();
        const dx = 110 - guide.position.point[0];
        const dy = 55 - guide.position.point[1];
        moving.style.transformOrigin = `${guide.position.point[0]}px ${guide.position.point[1]}px`;
        moving.style.transformBox = 'view-box';
        moving.style.opacity = '1';
        animation = moving.animate([
          { transform: `translate(${dx}px, ${dy}px) scale(.72)`, opacity: .92, offset: 0 },
          { transform: `translate(${dx}px, ${dy}px) scale(.72)`, opacity: .92, offset: .15 },
          { transform: 'translate(0, 0) scale(1)', opacity: 1, offset: 1 },
        ], { duration: 2200, easing: 'cubic-bezier(.35,0,.2,1)', fill: 'forwards' });
        const active = animation;
        state = 'running'; label('pause'); setStatus('running');
        active.finished.then(() => { if (animation === active) { state = 'finished'; label('replay'); setStatus('finished'); } }).catch(() => {});
      }
      play.onclick = () => {
        if (state === 'running') { animation.pause(); state = 'paused'; label('resume'); setStatus('paused'); }
        else if (state === 'paused') { animation.play(); state = 'running'; label('pause'); setStatus('running'); }
        else start();
      };
      toggle = () => { if (!details.open && state === 'running') { animation.pause(); state = 'paused'; label('resume'); setStatus('paused'); } };
      visibility = () => { if (document.hidden && state === 'running') { animation.pause(); state = 'paused'; label('resume'); setStatus('paused'); } };
      mediaChange = event => { if (event.matches) { showFinal(true); } else { label(state === 'finished' ? 'replay' : 'play'); } };
      details.addEventListener('toggle', toggle);
      document.addEventListener('visibilitychange', visibility);
      reduced?.addEventListener?.('change', mediaChange);
      if (reduced?.matches) { label('show'); setStatus('ready'); }
    }
    const cleanup = () => {
      animation?.cancel();
      if (toggle) details.removeEventListener('toggle', toggle);
      if (visibility) document.removeEventListener('visibilitychange', visibility);
      if (mediaChange) reduced?.removeEventListener?.('change', mediaChange);
      if (container._partLocationCleanup === cleanup) delete container._partLocationCleanup;
    };
    container._partLocationCleanup = cleanup;
    return cleanup;
  }
  return { mount, describePart };
});
