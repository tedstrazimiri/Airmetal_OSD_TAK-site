const OSD_SA_DATA = {"schema":1,"scope":"Offline firefighting situational-awareness concept. Synthetic local coordinates; no TAK connection, real people or operational tracking.","heading_deg":45,"god_eye_range_m":1000,"radar_range_m":3000,"radar_half_angle_deg":50,"range_divisions":4,"max_contacts":8,"cell_voltage":"3.78","aux_preview":{"low":"normal","middle":"god-eye","high":"radar","channel":null},"contacts":[{"id":"F1","label":"Fire location 1","shape":"square","north_m":480,"east_m":240,"age_s":8,"stale_after_s":60},{"id":"C1","label":"Crew 1","shape":"circle","north_m":160,"east_m":-260,"age_s":3,"stale_after_s":30},{"id":"W1","label":"Water point 1","shape":"triangle","north_m":-400,"east_m":170,"age_s":12,"stale_after_s":120},{"id":"S1","label":"Staging point 1","shape":"box-cross","north_m":60,"east_m":690,"age_s":10,"stale_after_s":120},{"id":"F2","label":"Distant fire location 2","shape":"square","north_m":2200,"east_m":650,"age_s":5,"stale_after_s":60}],"mgrs":{"schema":1,"synthetic":true,"datum":"WGS84","grid_resolution_m":1,"precision_digits_per_axis":5,"conversion":{"library":"mgrs","version":"1.5.0","method":"toMGRS(lat, lon, MGRSPrecision=5); truncated grid cell","geodesic_library":"pyproj","geodesic_version":"3.6.1","selected_marker_method":"WGS84 geodesic from ownship; bearing atan2(east, north); distance hypot(north, east)","inverse_check":"toLatLon; independent pyproj UTM shows source inside returned 1 m cell","sources":["https://github.com/hobuinc/mgrs","https://geographiclib.sourceforge.io/html/GeoConvert.1.html"]},"ownship":{"id":"OWN","label":"OWN POSITION","latitude_deg":49.1234,"longitude_deg":-80.1234,"mgrs":"17UNQ6395741543","zone_band":"17U","square_100km":"NQ","easting":"63957","northing":"41543","formatted":"17U NQ 63957 41543","inverse_latitude_deg":49.12339400171729,"inverse_longitude_deg":-80.12341157490705,"utm_cell_offset_m":[0.8367960816249251,0.6765741119161248]},"selected_marker":{"id":"F2","label":"F2 FIRE","latitude_deg":49.14318163744476,"longitude_deg":-80.11449123118119,"mgrs":"17UNQ6458243750","zone_band":"17U","square_100km":"NQ","easting":"64582","northing":"43750","formatted":"17U NQ 64582 43750","inverse_latitude_deg":49.1431791408237,"inverse_longitude_deg":-80.11449293158957,"utm_cell_offset_m":[0.12076862994581461,0.2789894472807646],"north_m":2200,"east_m":650,"distance_m":2294.0139493908923}}};
/* Offline situational-awareness concept. No TAK connection or AUX input. */
(() => {
  'use strict';
  const cfg = OSD_SA_DATA;
  const canvas = document.getElementById('tak-screen'), ctx = canvas.getContext('2d');
  const heading = document.getElementById('tak-heading'), mode = document.getElementById('tak-mode');
  const range = document.getElementById('tak-range'), feed = document.getElementById('tak-feed');
  const landscape = document.getElementById('tak-landscape'), grid = document.getElementById('tak-mgrs');
  const camera = document.getElementById('tak-camera');
  const caption = document.getElementById('tak-caption');
  const native = document.createElement('canvas'); native.width = 360; native.height = 288;
  const nc = native.getContext('2d'), sx = 860 / 360, sy = 2.5;
  function nearest(h, usable = true) {
    if (!usable || !Number.isFinite(h)) return [];
    const contacts = [];
    for (const c of cfg.contacts.slice(0,cfg.max_contacts)) {
      if (![c.north_m,c.east_m,c.age_s,c.stale_after_s].every(Number.isFinite) || c.age_s<0 || c.age_s>=c.stale_after_s) continue;
      const distance = Math.hypot(c.north_m,c.east_m);
      const bearing = distance ? ((Math.atan2(c.east_m,c.north_m)*180/Math.PI-h+180)%360+360)%360-180 : null;
      const direction = bearing===null ? 0x20 : 0x60+((Math.floor((180-bearing)/22.5+.5)%16+16)%16);
      contacts.push({id:c.id,distance_m:distance,relative_bearing_deg:bearing,direction_glyph:direction});
    }
    contacts.sort((a,b)=>a.distance_m-b.distance_m || (a.id<b.id?-1:a.id>b.id?1:0));
    return contacts.slice(0,2);
  }
  function markerReadout(c) {
    if (!c) return [45,45];
    const distance = c.distance_m<1000 ? `${Math.floor(c.distance_m+.5)}M` : `${(c.distance_m/1000).toFixed(1)}KM`;
    return [...Array.from(c.id+' ',x=>x.charCodeAt(0)),c.direction_glyph,...Array.from(' '+distance,x=>x.charCodeAt(0))];
  }
  function placement(h, view, limit, usable = true) {
    if (!Number.isFinite(h) || limit <= 0 || !['god-eye', 'radar'].includes(view)) throw new Error('Invalid SA geometry');
    const own = [180, view === 'god-eye' ? 144 : 252], span = view === 'god-eye' ? 260 : 500;
    const a = h * Math.PI / 180, contacts = [], hidden = [];
    for (const c of cfg.contacts.slice(0, cfg.max_contacts)) {
      if (!usable || c.age_s >= c.stale_after_s) {hidden.push({id: c.id, reason: 'stale'}); continue;}
      const f = c.north_m * Math.cos(a) + c.east_m * Math.sin(a);
      const r = c.east_m * Math.cos(a) - c.north_m * Math.sin(a);
      const bearing = Math.atan2(r, f) * 180 / Math.PI, distance = Math.hypot(f, r);
      if (view === 'radar' && Math.abs(bearing) > cfg.radar_half_angle_deg) {hidden.push({id: c.id, reason: 'outside_sector'}); continue;}
      const offscale = distance > limit, scale = offscale && distance ? Math.min(distance, limit * .96) / distance : 1;
      contacts.push({...c, distance_m: distance, relative_bearing_deg: bearing, offscale,
        native_xy: [own[0] + r * scale / limit * span / sx, own[1] - f * scale / limit * span / sy]});
    }
    return {mode: view, heading_deg: (h % 360 + 360) % 360, range_m: limit,
      range_step_m: limit / cfg.range_divisions, ownship_native: own,
      radius_screen_px: span, feed_usable: usable, contacts, hidden, nearest_tak:nearest(h,usable)};
  }
  const image = src => new Promise((resolve, reject) => {const im = new Image(); im.onload = () => resolve(im); im.onerror = () => reject(new Error(src)); im.src = src;});
  let assets;
  const overlap = (a, b) => a[0] < b[2] + 2 && a[2] + 2 > b[0] && a[1] < b[3] + 2 && a[3] + 2 > b[1];
  function paint() {
    if (!assets) return;
    const h = heading.valueAsNumber, view = mode.value;
    document.getElementById('tak-heading-value').textContent = `${String(h).padStart(3, '0')}°`;
    range.disabled = view === 'normal' || grid.checked; feed.disabled = view === 'normal';
    landscape.disabled = view === 'normal'; grid.disabled = view === 'normal';
    camera.disabled = view === 'normal' || !landscape.checked;
    heading.disabled = view === 'normal';
    if (view === 'normal') {
      ctx.drawImage(assets[1], 0, 0, 960, 720);
      window.osdSaPrototype.state = {mode: 'normal', heading_deg: cfg.heading_deg};
      caption.textContent = 'Simulated AUX LOW · normal flight HUD restored. AUX channel remains unassigned.';
      return;
    }
    const state = placement(h, view, Number(range.value), feed.checked);
    window.osdSaPrototype.state = state;
    nc.clearRect(0, 0, 360, 288); nc.lineJoin = 'miter'; nc.lineCap = 'butt';
    const [cx, cy] = state.ownship_native, span = state.radius_screen_px;
    function line(points, color = '#6c6c6c', width = 1) {
      nc.strokeStyle = color; nc.lineWidth = width; nc.beginPath();
      points.forEach(([x, y], i) => i ? nc.lineTo(x, y) : nc.moveTo(x, y)); nc.stroke();
    }
    const reserved = [], elements = [], labels = [];
    function text(col, row, value, element, category = 'sa', fixedCodes = null) {
      const chars = fixedCodes || Array.from(value, c => c.charCodeAt(0));
      if (col < 0 || col + chars.length > 30 || row < 0 || row >= 16) throw new Error('SA text clipping');
      const box = [col * 12, row * 18, (col + chars.length) * 12, (row + 1) * 18];
      if (!grid.checked) nc.clearRect(box[0] - 1, box[1] - 1, box[2] - box[0] + 2, 20);
      chars.forEach((ch, i) => nc.drawImage(assets[0], ch % 16 * 12, Math.floor(ch / 16) * 18, 12, 18, (col + i) * 12, row * 18, 12, 18));
      reserved.push(box); elements.push({element, category, column: col, row, glyph_codes: chars});
    }
    function compose() {
      ctx.fillStyle = '#0c0c0c'; ctx.fillRect(0, 0, 960, 720);
      if (landscape.checked) {
        ctx.globalAlpha = view==='god-eye' && !grid.checked ? 1 : .42;
        ctx.drawImage(assets[camera.value === 'forward' ? 2 : 3], 0, 0); ctx.globalAlpha = 1;
      }
      ctx.imageSmoothingEnabled = false; ctx.drawImage(native, 50, 0, 860, 720);
      state.landscape_visible = landscape.checked; state.georegistered = false;
      state.background_view = camera.value; state.camera_angle_independent = true;
      state.background_opacity = view==='god-eye' && !grid.checked ? 1 : .42;
    }
    if (grid.checked) {
      text(1, 0, 'TAK MGRS', 'sa_mode'); text(22, 0, `HDG${String(h).padStart(3, '0')}`, 'azimuth');
      for (const [name, record, row] of [['own', cfg.mgrs.ownship, 2], ['selected', cfg.mgrs.selected_marker, 7]]) {
        nc.fillStyle = 'rgba(0,0,0,.824)'; nc.fillRect(24, row * 18 - 6, 312, 67);
        line([[24,row*18-6],[335,row*18-6],[335,(row+3)*18+6],[24,(row+3)*18+6],[24,row*18-6]]);
        text(3, row, record.label, `${name}_label`);
        if (name === 'selected' && !feed.checked) {text(3, row + 1, 'TAK STALE', 'feed_status'); continue;}
        text(3, row + 1, `${record.zone_band} ${record.square_100km}`, `${name}_mgrs_zone_square`);
        text(3, row + 2, `${record.easting} ${record.northing}`, `${name}_mgrs_digits`);
      }
      if (feed.checked) text(3, 11, 'F2 2.29KM', 'selected_distance');
      text(1, 13, '', 'osd_avg_cell_voltage_pos', 'retained', [0x93, ...Array.from(cfg.cell_voltage, c => c.charCodeAt(0)), 0x06]);
      text(1, 15, 'WGS84', 'coordinate_datum'); text(19, 15, 'GRID 1M', 'coordinate_resolution');
      Object.assign(state, {mode: 'mgrs', underlying_mode: view, elements, mgrs: cfg.mgrs, selected_coordinate_visible: feed.checked, contacts: [], ownship_native: null});
      compose();
      caption.textContent = `MGRS · own ${cfg.mgrs.ownship.formatted} · ${feed.checked ? 'F2 ' + cfg.mgrs.selected_marker.formatted : 'selected marker hidden: TAK stale'} · WGS84 · 1 m grid resolution, not GPS accuracy. Synthetic coordinates.`;
      return;
    }
    for (let ring = 1; ring <= 4; ring++) {
      const radius = span * ring / 4, start = view === 'god-eye' ? -180 : -50, stop = view === 'god-eye' ? 180 : 50;
      for (let deg = start; deg < stop; deg += 12) {
        const pts = [];
        for (let q = deg; q <= Math.min(deg + 6, stop); q += 2) {
          const a = q * Math.PI / 180; pts.push([cx + radius * Math.sin(a) / sx, cy - radius * Math.cos(a) / sy]);
        }
        line(pts);
      }
    }
    if (view === 'radar') for (const deg of [-50, 0, 50]) {
      const a = deg * Math.PI / 180;
      for (let i = 1; i < 20; i += 2) line([[cx + span * i / 20 * Math.sin(a) / sx, cy - span * i / 20 * Math.cos(a) / sy],
        [cx + span * (i + 1) / 20 * Math.sin(a) / sx, cy - span * (i + 1) / 20 * Math.cos(a) / sy]], '#484848');
    }
    for (const c of state.contacts) {
      const [x, y] = c.native_xy.map(v => Math.floor(v + .5));
      let pts;
      if (c.offscale) {
        const a = c.relative_bearing_deg * Math.PI / 180, fx = Math.sin(a), fy = -Math.cos(a);
        pts = [[x - fx * 5 - fy * 4, y - fy * 5 + fx * 4], [x + fx * 3, y + fy * 3], [x - fx * 5 + fy * 4, y - fy * 5 - fx * 4]];
      } else if (c.shape === 'triangle') pts = [[x, y - 4], [x + 4, y + 4], [x - 4, y + 4], [x, y - 4]];
      else if (c.shape === 'circle') {
        pts = Array.from({length: 25}, (_, i) => [x + 4 * Math.cos(i * Math.PI / 12), y + 4 * Math.sin(i * Math.PI / 12)]);
      } else pts = [[x - 4, y - 4], [x + 4, y - 4], [x + 4, y + 4], [x - 4, y + 4], [x - 4, y - 4]];
      line(pts, '#000', 3); line(pts, '#fff');
      if (c.shape === 'box-cross' && !c.offscale) {line([[x - 3, y], [x + 3, y]], '#fff'); line([[x, y - 3], [x, y + 3]], '#fff');}
    }
    const arrow = [[cx, cy - 8], [cx + 5, cy + 5], [cx, cy + 2], [cx - 5, cy + 5], [cx, cy - 8]];
    line(arrow, '#000', 3); line(arrow, '#fff'); line([[cx, cy + 2], [cx, cy + 8]], '#fff');
    text(1, 0, view === 'god-eye' ? 'TAK EYE' : 'TAK RDR', 'sa_mode');
    text(22, 0, `HDG${String(h).padStart(3, '0')}`, 'azimuth');
    text(1, 13, '', 'osd_avg_cell_voltage_pos', 'retained', [0x93, ...Array.from(cfg.cell_voltage, c => c.charCodeAt(0)), 0x06]);
    const division = `${state.range_step_m}M/DIV`;
    text(9, 15, division, 'range_step');
    text(1, 15, state.range_m >= 1000 ? `R${Math.floor(state.range_m / 1000)}KM` : `R${state.range_m}M`, 'max_range');
    if (landscape.checked) text(12, 0, 'MOCK', 'scene_identity');
    if (view === 'radar' && feed.checked) text(1, 1, `${state.contacts.length}/${cfg.contacts.length}`, 'visible_count');
    if (!feed.checked) text(10, 2, 'TAK STALE', 'feed_status');
    for (let i=0;i<2;i++) {
      const chars = markerReadout(state.nearest_tak[i]);
      text(29-chars.length,14+i,'',`nearest_tak_${i+1}`,'sa',chars);
    }
    for (const c of state.contacts) {
      const [x, y] = c.native_xy, label = c.id + (c.offscale ? '+' : '');
      const candidates = [[Math.ceil((x + 7) / 12), Math.floor(y / 18)], [Math.floor((x - 7) / 12) - label.length, Math.floor(y / 18)],
        [Math.floor(x / 12), Math.floor((y + 8) / 18) + 1], [Math.floor(x / 12), Math.floor((y - 8) / 18) - 1]];
      const fallback = [];
      for (let row = 1; row < 13; row++) for (let col = 0; col <= 30 - label.length; col++) fallback.push([col, row]);
      const score = q => (q[0] * 12 - x) ** 2 + (q[1] * 18 - y) ** 2;
      fallback.sort((a, b) => score(a) - score(b) || a[1] - b[1] || a[0] - b[0]); candidates.push(...fallback);
      const centers = [state.ownship_native, ...state.contacts.map(c => c.native_xy)];
      let found = false;
      for (const [col, row] of candidates) {
        const box = [col * 12, row * 18, (col + label.length) * 12, (row + 1) * 18];
        if (col < 0 || col + label.length > 30 || row < 1 || row >= 13 || reserved.some(r => overlap(box, r)) || centers.some(([px, py]) => overlap(box, [px - 6, py - 8, px + 6, py + 8]))) continue;
        if (Math.hypot(col * 12 - x, row * 18 - y) > 30) line([[x, y], [col * 12, row * 18 + 9]], '#6e6e6e');
        text(col, row, label, `marker_${c.id}`); labels.push({id: c.id, column: col, row, text: label}); found = true; break;
      }
      if (!found) throw new Error(`No SA label slot for ${c.id}`);
    }
    state.elements = elements; state.labels = labels;
    compose();
    caption.textContent = `${view === 'god-eye' ? 'Heading-up / ownship centred' : 'Forward fan / ±50°'} · HDG ${String(h).padStart(3, '0')}° · ${state.range_m} m range · ${state.contacts.length} displayed · ${state.contacts.filter(c => c.offscale).length} off-scale · ${state.hidden.length} omitted. Camera angle is independent; synthetic markers are not registered to scenery.`;
  }
  window.osdSaPrototype = {placement, nearest, state: null};
  heading.addEventListener('input', paint); feed.addEventListener('input', paint); range.addEventListener('change', paint);
  landscape.addEventListener('input', paint); grid.addEventListener('input', paint);
  camera.addEventListener('change', paint);
  mode.addEventListener('change', () => {if (mode.value !== 'normal') range.value = mode.value === 'god-eye' ? String(cfg.god_eye_range_m) : String(cfg.radar_range_m); paint();});
  Promise.all(['font-atlas.png', 'proposed-forward-velocity.png', 'scene-forward.png', 'scene-downward.png'].map(image)).then(images => {assets = images; paint();}).catch(err => {caption.textContent = `SA reference unavailable: ${err.message}`; throw err;});
})();
