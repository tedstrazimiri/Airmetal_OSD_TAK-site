const OSD_FLAT_DATA = {"config":{"schema":1,"scope":"Offline visual prototype only; assumed engineering envelope, not calibrated accuracy or confidence.","ground_gps_altitude_m":300.0,"default_gps_altitude_m":330.0,"gps_height_error_m":3.0,"release_assumption":"vehicle stationary; no nominal horizontal or vertical motion","residual_drift_allowance_m_s":0.5,"base_surface_error_m":1.0,"gravity_m_s2":9.80665,"roll_deg":-4.0,"pitch_up_deg":15.0,"camera_model":"justice-opencv","surface_label":"FLAT","diamond_reference":"world-down unit ray, roll/pitch only; no altitude or trajectory offset","future_terrain_label":"TER only when an implemented height-grid backend is actually used","terrain":"single horizontal plane at ground_gps_altitude_m; same altitude datum as aircraft GPS","dynamics":"stationary-release circle scale only; no true CCIP or in-flight trajectory model"},"active_width":401.8181818181818,"layout":{"schema":1,"scope":"Proposed flight HUD reference only; not saved FC/PCB configuration. SA pages keep their separate voltage-only policy.","grid":[30,16],"altitude_source":"GPS altitude minus same-datum flat-ground reference; barometric height ignored","rx_band_channel":null,"nearest_tak_count":2,"nearest_tak_policy":"Fresh bounded markers, sorted by horizontal distance then ID, independent of display sector/range. Arrows are relative to aircraft azimuth.","home_fixture":{"north_m":166.2983158520316,"east_m":-68.88301782571617},"diamond_half_size_native":10,"fields":[{"element":"own_mgrs_zone_square","column":1,"row":0,"category":"proposed"},{"element":"own_mgrs_digits","column":1,"row":1,"category":"proposed"},{"element":"osd_gps_sats_pos","column":1,"row":7},{"element":"osd_altitude_pos","column":24,"right_edge":29,"row":7},{"element":"osd_vtx_channel_pos","column":22,"row":0},{"element":"rx_band_channel","column":21,"row":1,"category":"proposed"},{"element":"osd_link_quality_pos","column":24,"row":2},{"element":"osd_avg_cell_voltage_pos","column":1,"row":14},{"element":"osd_mah_drawn_pos","column":1,"row":15},{"element":"osd_home_dir_pos","column":12,"row":15},{"element":"osd_home_dist_pos","column":13,"row":15},{"element":"nearest_tak_1","column":19,"right_edge":29,"row":14,"category":"proposed"},{"element":"nearest_tak_2","column":19,"right_edge":29,"row":15,"category":"proposed"}]},"lens":{"fx":525.1984406930287,"fy":546.7936434357424,"cx":480.73454225530855,"cy":363.8516267192045,"b2":0.0,"k1":-0.02477533580188975,"k2":-0.0051902318832639655,"k3":0.0,"k4":0.0,"p1":0.0,"p2":0.0},"base_elements":[{"element":"own_mgrs_zone_square","column":1,"row":0,"glyph_codes":[77,71,82,83,32,49,55,85,32,78,81],"category":"proposed"},{"element":"own_mgrs_digits","column":1,"row":1,"glyph_codes":[54,51,57,53,55,32,52,49,53,52,51],"category":"proposed"},{"element":"osd_gps_sats_pos","column":1,"row":7,"glyph_codes":[30,31,49,52],"category":"retained"},{"element":"osd_vtx_channel_pos","column":22,"row":0,"glyph_codes":[86,84,88,32,82,58,49],"category":"retained"},{"element":"rx_band_channel","column":21,"row":1,"glyph_codes":[82,88,32,45,45,47,45,45],"category":"proposed"},{"element":"osd_link_quality_pos","column":24,"row":2,"glyph_codes":[76,81,32,57,57],"category":"retained"},{"element":"osd_avg_cell_voltage_pos","column":1,"row":14,"glyph_codes":[147,51,46,55,56,6],"category":"retained"},{"element":"osd_mah_drawn_pos","column":1,"row":15,"glyph_codes":[50,52,54,48,7],"category":"retained"},{"element":"osd_home_dir_pos","column":12,"row":15,"glyph_codes":[107],"category":"retained"},{"element":"osd_home_dist_pos","column":13,"row":15,"glyph_codes":[49,56,48,12],"category":"retained"},{"element":"nearest_tak_1","column":20,"row":14,"glyph_codes":[67,49,32,109,32,51,48,53,77],"category":"proposed"},{"element":"nearest_tak_2","column":20,"row":15,"glyph_codes":[87,49,32,99,32,52,51,53,77],"category":"proposed"},{"element":"selected_station_profile","column":11,"row":13,"glyph_codes":[76,32,66,65,71,45,65],"category":"proposed"},{"element":"left_station","column":4,"row":12,"glyph_codes":[91,76,32,32,82,68,89,93],"category":"proposed"},{"element":"right_station","column":18,"row":12,"glyph_codes":[91,82,32,32,82,68,89,93],"category":"proposed"},{"element":"terrain_assumption","column":1,"row":3,"glyph_codes":[70,76,65,84],"category":"proposed"}]};
/* Offline documentation prototype. OSD_FLAT_DATA is injected by the renderer. */
(() => {
  'use strict';
  const data = OSD_FLAT_DATA, cfg = data.config, lens = data.lens;
  const canvas = document.getElementById('flat-screen'), ctx = canvas.getContext('2d');
  const gps = document.getElementById('flat-gps-altitude');
  const ground = document.getElementById('flat-ground-reference');
  const error = document.getElementById('flat-height-error');
  const valid = document.getElementById('flat-gps-valid');
  const roll = document.getElementById('flat-roll'), pitch = document.getElementById('flat-pitch');
  const caption = document.getElementById('flat-caption');
  const native = document.createElement('canvas'); native.width = 360; native.height = 288;
  const nc = native.getContext('2d');
  const sx = 860 / 360, sy = 2.5;
  const altitudeField = data.layout.fields.find(f => f.element === 'osd_altitude_pos');
  const bitmap = (src) => new Promise((resolve, reject) => {
    const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error(src)); img.src = src;
  });

  function estimate(alt, reference, dh, usable) {
    if (!usable) return {valid: false, reason: 'NO GPS H'};
    if (![alt, reference, dh].every(Number.isFinite) || dh < 0) return {valid: false, reason: 'BAD GPS H'};
    const h = alt - reference;
    if (h <= Math.max(dh, .5)) return {valid: false, reason: 'HEIGHT UNCERT', height_m: h};
    const t = Math.sqrt(2 * h / cfg.gravity_m_s2);
    const allowanceTime = Math.sqrt(2*(h+dh)/cfg.gravity_m_s2);
    const components = {base_m: cfg.base_surface_error_m,
      drift_m: cfg.residual_drift_allowance_m_s*allowanceTime};
    const radius = Object.values(components).reduce((a, b) => a + b, 0);
    return {valid: true, height_m: h, gps_altitude_m: alt, ground_gps_altitude_m: reference,
      gps_height_error_m: dh, fall_time_s: t, allowance_time_s:allowanceTime,
      release_assumption:'stationary', radius_m: radius, diameter_m: 2 * radius, components_m: components,
      reference_ned_unit: [0,0,1]};
  }
  function cameraRay(ned, rollDeg, pitchUpDeg) {
    const r = rollDeg * Math.PI / 180, p = pitchUpDeg * Math.PI / 180;
    const cr = Math.cos(r), sr = Math.sin(r), cp = Math.cos(p), sp = Math.sin(p);
    const bx = cp * ned[0] - sp * ned[2];
    const by = sp * sr * ned[0] + cr * ned[1] + cp * sr * ned[2];
    const bz = sp * cr * ned[0] - sr * ned[1] + cp * cr * ned[2];
    return [by, -bx, bz];
  }
  const nearest = v => Math.trunc(v + (v >= 0 ? .5 : -.5));
  function project(v, rollDeg, pitchUpDeg) {
    const [x, y, z] = cameraRay(v,rollDeg,pitchUpDeg), horizontal = Math.hypot(x, y);
    if (z <= 0) throw new Error('Fixture outside camera plane');
    const theta = Math.atan2(horizontal, z), q = horizontal > 0 ? theta / horizontal : 0;
    const a = x * q, b = y * q, t2 = theta * theta;
    const radial = 1 + t2 * (lens.k1 + t2 * (lens.k2 + t2 * (lens.k3 + t2 * lens.k4)));
    const xd = a * radial + lens.p1 * (t2 + 2 * a * a) + 2 * lens.p2 * a * b;
    const yd = b * radial + lens.p2 * (t2 + 2 * b * b) + 2 * lens.p1 * a * b;
    return [180 + nearest((lens.cx + lens.fx * xd + lens.b2 * yd - 479.5) * data.active_width / 960),
      144 + nearest((lens.cy + lens.fy * yd - 359.5) * 288 / 720)];
  }
  function compute(alt, reference, dh, usable = true, rollDeg = cfg.roll_deg, pitchUpDeg = cfg.pitch_up_deg) {
    // Height is deliberately absent from this unit-ray projection.
    const pt = project([0,0,1],rollDeg,pitchUpDeg);
    const state = {...estimate(alt, reference, dh, usable), native_world_down:pt,
      reference_kind:'world-down', roll_deg:rollDeg, pitch_up_deg:pitchUpDeg, surface_label:'FLAT'};
    if (!state.valid) return {...state, display_mode: 'diamond-only', circle_visible: false};
    let radius = 0;
    for (let i = 0; i < 96; i++) {
      const a = i * 2 * Math.PI / 96;
      const edge = project([state.radius_m * Math.cos(a),state.radius_m * Math.sin(a),state.height_m],rollDeg,pitchUpDeg);
      radius = Math.max(radius, Math.hypot((edge[0] - pt[0]) * sx, (edge[1] - pt[1]) * sy));
    }
    return {...state, display_mode: 'world-down-circle', circle_visible: true, screen_radius_px: Math.ceil(radius) + 2,
      screen_diameter_px: 2 * (Math.ceil(radius) + 2)};
  }
  let assets;
  function paint() {
    if (!assets) return;
    const state = compute(gps.valueAsNumber, ground.valueAsNumber, error.valueAsNumber, valid.checked,roll.valueAsNumber,pitch.valueAsNumber);
    window.osdFlatPrototype.state = state;
    document.getElementById('flat-gps-value').textContent = `${gps.value} m`;
    document.getElementById('flat-roll-value').textContent = `${roll.value}°`;
    document.getElementById('flat-pitch-value').textContent = `${pitch.value}°`;
    nc.clearRect(0, 0, 360, 288); nc.drawImage(assets[1], 0, 0);
    const dynamicBoxes = [];
    function write(col, row, text, symbol = null, tail = null) {
      const chars = [...(symbol === null ? [] : [symbol]), ...Array.from(text, c => c.charCodeAt(0)), ...(tail === null ? [] : [tail])];
      if (col < 0 || col + chars.length > 30) throw new Error('Prototype text clips');
      chars.forEach((ch, i) => nc.drawImage(assets[2], ch % 16 * 12, Math.floor(ch / 16) * 18, 12, 18, (col + i) * 12, row * 18, 12, 18));
      dynamicBoxes.push({column: col, row, glyph_codes: chars});
    }
    const white = new Uint8Array(360 * 288);
    function point(x, y) { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < 360 && y >= 0 && y < 288) white[y * 360 + x] = 1; }
    function line(x0, y0, x1, y1) {
      x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), ix = x0 < x1 ? 1 : -1, iy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (;;) { point(x0, y0); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) {err += dy; x0 += ix;} if (e2 <= dx) {err += dx; y0 += iy;} }
    }
    if (state.valid) {
      const heightText = String(Math.round(state.height_m));
      write(altitudeField.right_edge-heightText.length-2, altitudeField.row, heightText, 0x7f, 0x0c);
      write(23, 9, `D${state.diameter_m.toFixed(1)}M`);
      const [x, y] = state.native_world_down, r = state.screen_radius_px;
      for (let a = 0; a < 360; a += 24) {
        for (let i = a; i < a + 14; i += 2) {
          const p = i * Math.PI / 180, q = (i + 2) * Math.PI / 180;
          line(x + r / sx * Math.cos(p), y + r / sy * Math.sin(p), x + r / sx * Math.cos(q), y + r / sy * Math.sin(q));
        }
      }
      // Reserve HUD text, including spaces, around the height-dependent circle.
      for (const item of [...data.base_elements, ...dynamicBoxes]) {
        if (!item.glyph_codes.length) continue;
        for (let yy = Math.max(0, item.row * 18 - 1); yy <= Math.min(287, (item.row + 1) * 18); yy++)
          for (let xx = Math.max(0, item.column * 12 - 1); xx <= Math.min(359, (item.column + item.glyph_codes.length) * 12); xx++) white[yy * 360 + xx] = 0;
      }
      caption.textContent = `World down: XY ${state.native_world_down.join(', ')} · FLAT · GPS height ${state.height_m.toFixed(1)} m · assumed surface diameter ${state.diameter_m.toFixed(1)} m · display diameter ${state.screen_diameter_px} px. Height changes only the circle; roll/pitch moves the diamond.`;
    } else {
      write(altitudeField.right_edge-3, altitudeField.row, '--', 0x7f);
      caption.textContent = 'Diamond only · attitude-projected vertical drop reference, without a ranged impact prediction or uncertainty circle. GPS height/reference unusable; barometric height ignored.';
    }
    const [x, y] = state.native_world_down;
    const size = data.layout.diamond_half_size_native;
    line(x, y - size, x + size, y); line(x + size, y, x, y + size);
    line(x, y + size, x - size, y); line(x - size, y, x, y - size); point(x, y);
    const pixels = new ImageData(360, 288);
    for (let y = 0; y < 288; y++) for (let x = 0; x < 360; x++) {
      const i = y * 360 + x;
      let edge = Boolean(white[i]);
      if (!edge) for (let yy = Math.max(0, y - 1); yy <= Math.min(287, y + 1); yy++)
        for (let xx = Math.max(0, x - 1); xx <= Math.min(359, x + 1); xx++) edge ||= Boolean(white[yy * 360 + xx]);
      if (edge) { pixels.data[i * 4 + 3] = 255; if (white[i]) pixels.data.fill(255, i * 4, i * 4 + 3); }
    }
    const marks = document.createElement('canvas'); marks.width = 360; marks.height = 288;
    marks.getContext('2d').putImageData(pixels, 0, 0); nc.drawImage(marks, 0, 0);
    ctx.clearRect(0, 0, 960, 720); ctx.drawImage(assets[0], 0, 0);
    ctx.imageSmoothingEnabled = false; ctx.drawImage(native, 50, 0, 860, 720);
  }
  window.osdFlatPrototype = {compute, state: null};
  for (const control of [gps, ground, error, valid, roll, pitch]) control.addEventListener('input', paint);
  Promise.all(['scene-downward.png', 'flat-prototype-base.png', 'font-atlas.png'].map(bitmap)).then(imgs => {assets = imgs; paint();}).catch(err => {caption.textContent = `Reference assets unavailable: ${err.message}`; throw err;});
})();
