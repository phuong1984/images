/**
 * GUI Components Extension for Scratch / TurboWarp / PenguinMod
 *
 * Widgets:
 *   Text Label · Button (text or image) · Image Button · Text Box
 *   Image · Checkbox · Slider · Dropdown · Panel
 *
 * Usage: Load as an unsandboxed custom extension in TurboWarp or PenguinMod.
 *
 * All widgets are injected into an overlay <div> that sits on top of the
 * Scratch stage canvas so they are always visible during project playback.
 */

(function () {
  "use strict";

  // ─── Overlay ──────────────────────────────────────────────────────────────

  let overlay = null;

  /** Set once the extension is constructed; used to read the actual
   *  configured stage size (TurboWarp/PenguinMod allow this to be changed
   *  in Settings, unlike vanilla Scratch's fixed 480×360). */
  let _runtimeRef = null;

  /**
   * Returns the project's actual logical stage resolution.
   * TurboWarp/PenguinMod expose this as runtime.stageWidth/stageHeight and
   * update it live if the user changes it in Settings → Stage Size.
   * Falls back to vanilla Scratch's fixed 480×360 if unavailable.
   */
  function _getStageSize() {
    const rt = _runtimeRef;
    const w = (rt && typeof rt.stageWidth  === "number" && rt.stageWidth  > 0) ? rt.stageWidth  : 480;
    const h = (rt && typeof rt.stageHeight === "number" && rt.stageHeight > 0) ? rt.stageHeight : 360;
    return { w, h };
  }

  /**
   * Registry of each widget's logical geometry (in the project's stage units,
   * e.g. 480×360 by default, or whatever custom size TurboWarp/PenguinMod is
   * configured with). Used to recompute actual on-screen pixel size/position
   * whenever the overlay is resized (fullscreen toggle, window resize, zoom,
   * or a mid-session stage-size change).
   * geomRegistry[id] = { x, y, w, h }  (w/h may be 0 meaning "auto/intrinsic")
   */
  const geomRegistry = {};

  /** Finds the actual Scratch stage canvas element. */
  function _findStageCanvas() {
    return (
      document.querySelector("canvas.sc-canvas") ||
      document.querySelector("[class*='stage_stage'] canvas") ||
      document.querySelector("[class*='stage_stage']") ||
      null
    );
  }

  /** Current scale factor: actual rendered overlay size ÷ logical stage width. */
  function _scale() {
    const ov = getOverlayRaw();
    const { w: stageW } = _getStageSize();
    if (!ov) return 1;
    const w = ov.offsetWidth || stageW;
    return w / stageW;
  }

  /** Returns the overlay element without triggering creation/sync logic. */
  function getOverlayRaw() { return overlay; }

  /**
   * Resizes and repositions the overlay to exactly match the stage canvas's
   * current rendered bounding box, then re-applies every widget's geometry
   * at the new scale factor so widget size/position stay proportional to
   * the stage regardless of windowed vs fullscreen rendering size, and
   * regardless of the project's configured stage resolution.
   */
  function _syncOverlayToStage() {
    if (!overlay) return;
    const canvas = _findStageCanvas();
    if (!canvas) return;
    const parent = overlay.parentElement;
    if (!parent) return;

    const canvasRect = canvas.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();

    overlay.style.left   = (canvasRect.left - parentRect.left) + "px";
    overlay.style.top    = (canvasRect.top  - parentRect.top)  + "px";
    overlay.style.width  = canvasRect.width  + "px";
    overlay.style.height = canvasRect.height + "px";

    // Re-apply every widget's geometry at the new scale so size AND position
    // both stay proportional to the stage in windowed vs fullscreen modes.
    _rescaleAllWidgets();
  }

  /** Re-applies stored logical geometry to every top-level widget at the
   *  current scale. Panel children are skipped here — their on-screen
   *  position is panel-relative and is rescaled by _rescalePanelChildren()
   *  immediately after, once the panel itself has its new pixel size.
   */
  function _rescaleAllWidgets() {
    const s = _scale();
    Object.keys(geomRegistry).forEach(id => {
      if (childPanel[id]) return;   // handled separately below
      const el = widgets[id];
      const g  = geomRegistry[id];
      if (!el || !g) return;
      _writeGeometryPx(el, g, s);
    });
    _rescalePanelChildren(s);
  }

  /** Rescales every panel child using its logical offset-from-panel-center
   *  geometry, now that all panels have been resized to the new scale. */
  function _rescalePanelChildren(s) {
    Object.keys(childPanel).forEach(childId => {
      const el = widgets[childId];
      const g  = geomRegistry[childId];
      const panelId = childPanel[childId];
      const panel   = widgets[panelId];
      if (!el || !g || !panel) return;
      // g.x/g.y here are logical offsets relative to the panel's own center
      // (set by addToPanel). Panel's own width/height at this scale:
      const panelG = geomRegistry[panelId];
      const panelW = panelG && panelG.w > 0 ? panelG.w * s : panel.offsetWidth;
      const panelH = panelG && panelG.h > 0 ? panelG.h * s : panel.offsetHeight;
      const w = g.w > 0 ? g.w * s : 0;
      const h = g.h > 0 ? g.h * s : 0;
      el.style.left = (g.x * s + panelW / 2 - w / 2) + "px";
      el.style.top  = (panelH / 2 - g.y * s - h / 2) + "px";
      if (g.w > 0) el.style.width  = w + "px";
      if (g.h > 0) el.style.height = h + "px";
    });
  }

  /** Writes actual CSS pixel left/top/width/height for a widget at scale s. */
  function _writeGeometryPx(el, g, s) {
    const { w: stageW, h: stageH } = _getStageSize();
    const ow = stageW * s;
    const oh = stageH * s;
    const w  = g.w > 0 ? g.w * s : 0;
    const h  = g.h > 0 ? g.h * s : 0;
    const halfW = w / 2;
    const halfH = h / 2;
    el.style.left = (g.x * s + ow / 2 - halfW) + "px";
    el.style.top  = (oh / 2 - g.y * s - halfH) + "px";
    if (g.w > 0) el.style.width  = w + "px";
    if (g.h > 0) el.style.height = h + "px";
    // Scale font-size proportionally too, if the widget sets one explicitly
    // and a logical font size was recorded.
    if (g.fontSize > 0) el.style.fontSize = (g.fontSize * s) + "px";
  }

  function getOverlay() {
    if (!overlay || !document.body.contains(overlay)) {
      overlay = document.createElement("div");
      overlay.id = "scratch-gui-overlay";
      Object.assign(overlay.style, {
        position:      "absolute",
        pointerEvents: "none",
        zIndex:        "9999",
        overflow:      "hidden",
      });
      const stage = _findStageCanvas() || document.body;
      const parent = stage.parentElement || document.body;
      parent.style.position = parent.style.position || "relative";
      parent.appendChild(overlay);

      _syncOverlayToStage();

      if (typeof ResizeObserver !== "undefined") {
        const ro = new ResizeObserver(() => _syncOverlayToStage());
        ro.observe(parent);
        const canvasEl = _findStageCanvas();
        if (canvasEl) ro.observe(canvasEl);
      }
      window.addEventListener("resize", _syncOverlayToStage);
      document.addEventListener("fullscreenchange", () => {
        requestAnimationFrame(_syncOverlayToStage);
        setTimeout(_syncOverlayToStage, 100);
      });
    }
    return overlay;
  }

  // ─── Widget Registry ──────────────────────────────────────────────────────
  // widgets[id] = HTMLElement

  const widgets = {};

  function getWidget(id) {
    return widgets[String(id).trim()] || null;
  }

  function registerWidget(id, el) {
    if (widgets[id]) widgets[id].remove();
    widgets[id] = el;
    getOverlay().appendChild(el);
  }

  function removeWidget(id) {
    if (!widgets[id]) return;
    // If this widget is a panel, remove all its children first.
    if (panelChildren[id]) {
      panelChildren[id].forEach(childId => {
        if (widgets[childId]) {
          widgets[childId].remove();
          delete widgets[childId];
          delete childPanel[childId];
          delete clickLatches[childId];
          delete clickCounts[childId];
          delete geomRegistry[childId];
        }
      });
      delete panelChildren[id];
    }
    // If this widget is a child of a panel, unregister it.
    if (childPanel[id]) {
      const pid = childPanel[id];
      if (panelChildren[pid]) panelChildren[pid].delete(id);
      delete childPanel[id];
    }
    widgets[id].remove();
    delete widgets[id];
    delete geomRegistry[id];
    // Clean up all event latches for this ID.
    delete eventLatches[id];
    delete eventLatches[id + "_changed"];
    delete eventLatches[id + "_enter"];
  }

  // ─── Geometry & Helpers ───────────────────────────────────────────────────

  /**
   * Applies position/size to a widget, in Scratch logical units (480×360).
   * Stores the logical geometry so it can be re-applied at the correct pixel
   * scale whenever the stage is resized (windowed ↔ fullscreen).
   */
  function applyGeometry(el, x, y, w, h, id) {
    const g = { x: Number(x), y: Number(y), w: Number(w) || 0, h: Number(h) || 0, fontSize: 0 };
    if (id) geomRegistry[id] = g;
    el.style.position  = "absolute";
    el.style.boxSizing = "border-box";
    _writeGeometryPx(el, g, _scale());
  }

  // ─── Button click state ───────────────────────────────────────────────────
  // Stored outside the DOM entirely — no dataset, no event timing issues.
  // clickLatches[id] = true means "clicked since last poll"
  // clickCounts[id]  = cumulative click count

  const clickLatches = {};
  const clickCounts  = {};

  // ─── Event latches ────────────────────────────────────────────────────────
  // Shared latch map for all non-button change events.
  // eventLatches[id] = true means "changed since last poll"
  const eventLatches = {};

  // ─── Panel children registry ──────────────────────────────────────────────
  // panelChildren[panelId] = Set of child widget IDs
  // childPanel[childId]    = panelId this child belongs to
  const panelChildren = {};
  const childPanel    = {};

  function parseColor(c) { return c || "transparent"; }

  // ─── Extension ────────────────────────────────────────────────────────────

  class GUIComponentsExtension {
    constructor(runtime) {
      this.runtime = runtime;
      _runtimeRef  = runtime;   // module-level, used by _getStageSize()

      runtime.on("PROJECT_START", () => {
        Object.keys(widgets).forEach(removeWidget);
        Object.keys(clickLatches).forEach(k => delete clickLatches[k]);
        Object.keys(clickCounts).forEach(k => delete clickCounts[k]);
        Object.keys(eventLatches).forEach(k => delete eventLatches[k]);
        Object.keys(panelChildren).forEach(k => delete panelChildren[k]);
        Object.keys(childPanel).forEach(k => delete childPanel[k]);
        Object.keys(geomRegistry).forEach(k => delete geomRegistry[k]);
        document.querySelectorAll("[data-gui-modal]").forEach(el => el.remove());
      });

      // TurboWarp/PenguinMod allow the stage size to be changed at runtime
      // via Settings → Stage Size. When that happens, the canvas's rendered
      // pixel size changes even though the parent container may not fire a
      // ResizeObserver callback right away — re-sync explicitly.
      if (typeof runtime.on === "function") {
        runtime.on("STAGE_SIZE_CHANGED", () => {
          requestAnimationFrame(_syncOverlayToStage);
        });
      }
      // Fallback safety net: some TurboWarp builds change stage size without
      // emitting a dedicated event, so also poll briefly after any project
      // start in case settings were changed between runs.
      runtime.on("PROJECT_START", () => {
        requestAnimationFrame(_syncOverlayToStage);
      });
    }

    getInfo() {
      return {
        id: "guiComponents",
        name: "GUI Components",
        color1: "#3A86FF",
        color2: "#2563EB",
        color3: "#1D4ED8",
        blocks: [

          // ══ TEXT LABEL ════════════════════════════════════════════════════

          {
            blockType: Scratch.BlockType.LABEL,
            text: "── Text Label ──",
          },
          {
            opcode: "createText",
            blockType: Scratch.BlockType.COMMAND,
            text: "create text [ID] at x:[X] y:[Y] max width:[MAXW] saying [TEXT]",
            arguments: {
              ID:   { type: Scratch.ArgumentType.STRING, defaultValue: "myLabel" },
              X:    { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              Y:    { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              MAXW: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              TEXT: { type: Scratch.ArgumentType.STRING, defaultValue: "Hello, World!" },
            },
          },
          {
            opcode: "setTextContent",
            blockType: Scratch.BlockType.COMMAND,
            text: "set text [ID] to [TEXT]",
            arguments: {
              ID:   { type: Scratch.ArgumentType.STRING, defaultValue: "myLabel" },
              TEXT: { type: Scratch.ArgumentType.STRING, defaultValue: "Hello!" },
            },
          },
          {
            opcode: "getTextContent",
            blockType: Scratch.BlockType.REPORTER,
            text: "content of text [ID]",
            arguments: {
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: "myLabel" },
            },
          },
          {
            opcode: "setTextAlign",
            blockType: Scratch.BlockType.COMMAND,
            text: "set text [ID] alignment [ALIGN]",
            arguments: {
              ID:    { type: Scratch.ArgumentType.STRING, defaultValue: "myLabel" },
              ALIGN: { type: Scratch.ArgumentType.STRING, defaultValue: "left", menu: "alignMenu" },
            },
          },

          // ══ BUTTON ════════════════════════════════════════════════════════

          "---",
          {
            blockType: Scratch.BlockType.LABEL,
            text: "── Button ──",
          },
          {
            opcode: "createButton",
            blockType: Scratch.BlockType.COMMAND,
            text: "create button [ID] at x:[X] y:[Y] w:[W] h:[H] label [LABEL]",
            arguments: {
              ID:    { type: Scratch.ArgumentType.STRING, defaultValue: "myButton" },
              X:     { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              Y:     { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              W:     { type: Scratch.ArgumentType.NUMBER, defaultValue: 120 },
              H:     { type: Scratch.ArgumentType.NUMBER, defaultValue: 36 },
              LABEL: { type: Scratch.ArgumentType.STRING, defaultValue: "Click me" },
            },
          },
          {
            opcode: "setButtonLabel",
            blockType: Scratch.BlockType.COMMAND,
            text: "set button [ID] label to [LABEL]",
            arguments: {
              ID:    { type: Scratch.ArgumentType.STRING, defaultValue: "myButton" },
              LABEL: { type: Scratch.ArgumentType.STRING, defaultValue: "OK" },
            },
          },
          {
            opcode: "setButtonColor",
            blockType: Scratch.BlockType.COMMAND,
            text: "set button [ID] background [BG] text color [FG]",
            arguments: {
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: "myButton" },
              BG: { type: Scratch.ArgumentType.COLOR,  defaultValue: "#3A86FF" },
              FG: { type: Scratch.ArgumentType.COLOR,  defaultValue: "#FFFFFF" },
            },
          },
          {
            opcode: "setButtonEnabled",
            blockType: Scratch.BlockType.COMMAND,
            text: "set button [ID] enabled: [STATE]",
            arguments: {
              ID:    { type: Scratch.ArgumentType.STRING, defaultValue: "myButton" },
              STATE: { type: Scratch.ArgumentType.STRING, defaultValue: "true", menu: "boolMenu" },
            },
          },
          {
            opcode: "buttonWasClicked",
            blockType: Scratch.BlockType.BOOLEAN,
            text: "button [ID] was clicked?",
            arguments: {
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: "myButton" },
            },
          },
          {
            opcode: "buttonClickCount",
            blockType: Scratch.BlockType.REPORTER,
            text: "click count of button [ID]",
            arguments: {
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: "myButton" },
            },
          },
          {
            opcode: "resetButtonClicks",
            blockType: Scratch.BlockType.COMMAND,
            text: "reset click count of button [ID]",
            arguments: {
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: "myButton" },
            },
          },

          // ══ TEXT BOX ══════════════════════════════════════════════════════

          "---",
          {
            blockType: Scratch.BlockType.LABEL,
            text: "── Text Box ──",
          },
          {
            opcode: "createTextBox",
            blockType: Scratch.BlockType.COMMAND,
            text: "create textbox [ID] at x:[X] y:[Y] w:[W] placeholder [PH]",
            arguments: {
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: "myInput" },
              X:  { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              Y:  { type: Scratch.ArgumentType.NUMBER, defaultValue: 50 },
              W:  { type: Scratch.ArgumentType.NUMBER, defaultValue: 160 },
              PH: { type: Scratch.ArgumentType.STRING, defaultValue: "Type here…" },
            },
          },
          {
            opcode: "getTextBoxValue",
            blockType: Scratch.BlockType.REPORTER,
            text: "value of textbox [ID]",
            arguments: {
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: "myInput" },
            },
          },
          {
            opcode: "setTextBoxValue",
            blockType: Scratch.BlockType.COMMAND,
            text: "set textbox [ID] to [VALUE]",
            arguments: {
              ID:    { type: Scratch.ArgumentType.STRING, defaultValue: "myInput" },
              VALUE: { type: Scratch.ArgumentType.STRING, defaultValue: "" },
            },
          },
          {
            opcode: "clearTextBox",
            blockType: Scratch.BlockType.COMMAND,
            text: "clear textbox [ID]",
            arguments: {
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: "myInput" },
            },
          },
          {
            opcode: "setTextBoxPlaceholder",
            blockType: Scratch.BlockType.COMMAND,
            text: "set textbox [ID] placeholder to [PH]",
            arguments: {
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: "myInput" },
              PH: { type: Scratch.ArgumentType.STRING, defaultValue: "Enter text…" },
            },
          },
          {
            opcode: "focusTextBox",
            blockType: Scratch.BlockType.COMMAND,
            text: "focus textbox [ID]",
            arguments: {
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: "myInput" },
            },
          },
          {
            opcode: "textBoxChanged",
            blockType: Scratch.BlockType.BOOLEAN,
            text: "textbox [ID] value changed?",
            arguments: {
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: "myInput" },
            },
          },
          {
            opcode: "textBoxEnterPressed",
            blockType: Scratch.BlockType.BOOLEAN,
            text: "textbox [ID] enter pressed?",
            arguments: {
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: "myInput" },
            },
          },

          // ══ IMAGE ═════════════════════════════════════════════════════════

          "---",
          {
            blockType: Scratch.BlockType.LABEL,
            text: "── Image ──",
          },
          {
            opcode: "createImage",
            blockType: Scratch.BlockType.COMMAND,
            text: "create image [ID] at x:[X] y:[Y] w:[W] h:[H] url [URL]",
            arguments: {
              ID:  { type: Scratch.ArgumentType.STRING, defaultValue: "myImage" },
              X:   { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              Y:   { type: Scratch.ArgumentType.NUMBER, defaultValue: -50 },
              W:   { type: Scratch.ArgumentType.NUMBER, defaultValue: 100 },
              H:   { type: Scratch.ArgumentType.NUMBER, defaultValue: 100 },
              URL: { type: Scratch.ArgumentType.STRING,
                     defaultValue: "https://extensions.turbowarp.org/dango.png" },
            },
          },
          {
            opcode: "createImageFromCostume",
            blockType: Scratch.BlockType.COMMAND,
            text: "create image [ID] at x:[X] y:[Y] w:[W] h:[H] from costume [COSTUME] of sprite [SPRITE]",
            arguments: {
              ID:      { type: Scratch.ArgumentType.STRING, defaultValue: "myImage" },
              X:       { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              Y:       { type: Scratch.ArgumentType.NUMBER, defaultValue: -50 },
              W:       { type: Scratch.ArgumentType.NUMBER, defaultValue: 100 },
              H:       { type: Scratch.ArgumentType.NUMBER, defaultValue: 100 },
              COSTUME: { type: Scratch.ArgumentType.STRING, defaultValue: "costume1" },
              SPRITE:  { type: Scratch.ArgumentType.STRING, defaultValue: "Sprite1" },
            },
          },
          {
            opcode: "setImageSize",
            blockType: Scratch.BlockType.COMMAND,
            text: "resize image [ID] to w:[W] h:[H]",
            arguments: {
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: "myImage" },
              W:  { type: Scratch.ArgumentType.NUMBER, defaultValue: 150 },
              H:  { type: Scratch.ArgumentType.NUMBER, defaultValue: 150 },
            },
          },

          // ══ CHECKBOX ══════════════════════════════════════════════════════

          "---",
          {
            blockType: Scratch.BlockType.LABEL,
            text: "── Checkbox ──",
          },
          {
            opcode: "createCheckbox",
            blockType: Scratch.BlockType.COMMAND,
            text: "create checkbox [ID] at x:[X] y:[Y] label [LABEL]",
            arguments: {
              ID:    { type: Scratch.ArgumentType.STRING, defaultValue: "myCheck" },
              X:     { type: Scratch.ArgumentType.NUMBER, defaultValue: -100 },
              Y:     { type: Scratch.ArgumentType.NUMBER, defaultValue: 80 },
              LABEL: { type: Scratch.ArgumentType.STRING, defaultValue: "Enable" },
            },
          },
          {
            opcode: "isChecked",
            blockType: Scratch.BlockType.BOOLEAN,
            text: "checkbox [ID] checked?",
            arguments: {
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: "myCheck" },
            },
          },
          {
            opcode: "setChecked",
            blockType: Scratch.BlockType.COMMAND,
            text: "set checkbox [ID] checked: [STATE]",
            arguments: {
              ID:    { type: Scratch.ArgumentType.STRING, defaultValue: "myCheck" },
              STATE: { type: Scratch.ArgumentType.STRING, defaultValue: "true", menu: "boolMenu" },
            },
          },
          {
            opcode: "checkboxChanged",
            blockType: Scratch.BlockType.BOOLEAN,
            text: "checkbox [ID] changed?",
            arguments: {
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: "myCheck" },
            },
          },

          // ══ SLIDER ════════════════════════════════════════════════════════

          "---",
          {
            blockType: Scratch.BlockType.LABEL,
            text: "── Slider ──",
          },
          {
            opcode: "createSlider",
            blockType: Scratch.BlockType.COMMAND,
            text: "create slider [ID] at x:[X] y:[Y] w:[W] min:[MIN] max:[MAX] value:[VAL]",
            arguments: {
              ID:  { type: Scratch.ArgumentType.STRING, defaultValue: "mySlider" },
              X:   { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              Y:   { type: Scratch.ArgumentType.NUMBER, defaultValue: -100 },
              W:   { type: Scratch.ArgumentType.NUMBER, defaultValue: 160 },
              MIN: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              MAX: { type: Scratch.ArgumentType.NUMBER, defaultValue: 100 },
              VAL: { type: Scratch.ArgumentType.NUMBER, defaultValue: 50 },
            },
          },
          {
            opcode: "getSliderValue",
            blockType: Scratch.BlockType.REPORTER,
            text: "value of slider [ID]",
            arguments: {
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: "mySlider" },
            },
          },
          {
            opcode: "setSliderValue",
            blockType: Scratch.BlockType.COMMAND,
            text: "set slider [ID] to [VAL]",
            arguments: {
              ID:  { type: Scratch.ArgumentType.STRING, defaultValue: "mySlider" },
              VAL: { type: Scratch.ArgumentType.NUMBER, defaultValue: 50 },
            },
          },
          {
            opcode: "sliderChanged",
            blockType: Scratch.BlockType.BOOLEAN,
            text: "slider [ID] changed?",
            arguments: {
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: "mySlider" },
            },
          },

          // ══ DROPDOWN ══════════════════════════════════════════════════════

          "---",
          {
            blockType: Scratch.BlockType.LABEL,
            text: "── Dropdown ──",
          },
          {
            opcode: "createDropdown",
            blockType: Scratch.BlockType.COMMAND,
            text: "create dropdown [ID] at x:[X] y:[Y] w:[W] options [OPTS]",
            arguments: {
              ID:   { type: Scratch.ArgumentType.STRING, defaultValue: "myDropdown" },
              X:    { type: Scratch.ArgumentType.NUMBER, defaultValue: 80 },
              Y:    { type: Scratch.ArgumentType.NUMBER, defaultValue: 80 },
              W:    { type: Scratch.ArgumentType.NUMBER, defaultValue: 140 },
              OPTS: { type: Scratch.ArgumentType.STRING, defaultValue: "Apple,Banana,Cherry" },
            },
          },
          {
            opcode: "getDropdownValue",
            blockType: Scratch.BlockType.REPORTER,
            text: "value of dropdown [ID]",
            arguments: {
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: "myDropdown" },
            },
          },
          {
            opcode: "setDropdownOptions",
            blockType: Scratch.BlockType.COMMAND,
            text: "set dropdown [ID] options to [OPTS]",
            arguments: {
              ID:   { type: Scratch.ArgumentType.STRING, defaultValue: "myDropdown" },
              OPTS: { type: Scratch.ArgumentType.STRING, defaultValue: "Red,Green,Blue" },
            },
          },
          {
            opcode: "setDropdownSelected",
            blockType: Scratch.BlockType.COMMAND,
            text: "set dropdown [ID] selected to [VALUE]",
            arguments: {
              ID:    { type: Scratch.ArgumentType.STRING, defaultValue: "myDropdown" },
              VALUE: { type: Scratch.ArgumentType.STRING, defaultValue: "Apple" },
            },
          },
          {
            opcode: "dropdownChanged",
            blockType: Scratch.BlockType.BOOLEAN,
            text: "dropdown [ID] changed?",
            arguments: {
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: "myDropdown" },
            },
          },

          // ══ PANEL ═════════════════════════════════════════════════════════

          "---",
          {
            blockType: Scratch.BlockType.LABEL,
            text: "── Panel ──",
          },
          {
            opcode: "createPanel",
            blockType: Scratch.BlockType.COMMAND,
            text: "create panel [ID] at x:[X] y:[Y] w:[W] h:[H] color [COLOR]",
            arguments: {
              ID:    { type: Scratch.ArgumentType.STRING, defaultValue: "myPanel" },
              X:     { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              Y:     { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              W:     { type: Scratch.ArgumentType.NUMBER, defaultValue: 200 },
              H:     { type: Scratch.ArgumentType.NUMBER, defaultValue: 120 },
              COLOR: { type: Scratch.ArgumentType.COLOR,  defaultValue: "#FFFFFF" },
            },
          },
          {
            opcode: "setPanelColor",
            blockType: Scratch.BlockType.COMMAND,
            text: "set panel [ID] color to [COLOR]",
            arguments: {
              ID:    { type: Scratch.ArgumentType.STRING, defaultValue: "myPanel" },
              COLOR: { type: Scratch.ArgumentType.COLOR,  defaultValue: "#F0F4FF" },
            },
          },
          {
            opcode: "addToPanel",
            blockType: Scratch.BlockType.COMMAND,
            text: "add component [CHILD] to panel [ID]",
            arguments: {
              CHILD: { type: Scratch.ArgumentType.STRING, defaultValue: "myLabel" },
              ID:    { type: Scratch.ArgumentType.STRING, defaultValue: "myPanel" },
            },
          },
          {
            opcode: "removeFromPanel",
            blockType: Scratch.BlockType.COMMAND,
            text: "remove component [CHILD] from panel [ID]",
            arguments: {
              CHILD: { type: Scratch.ArgumentType.STRING, defaultValue: "myLabel" },
              ID:    { type: Scratch.ArgumentType.STRING, defaultValue: "myPanel" },
            },
          },

          // ══ TEXT AREA ═════════════════════════════════════════════════════

          "---",
          {
            blockType: Scratch.BlockType.LABEL,
            text: "── Text Area ──",
          },
          {
            opcode: "createTextArea",
            blockType: Scratch.BlockType.COMMAND,
            text: "create textarea [ID] at x:[X] y:[Y] w:[W] h:[H] placeholder [PH]",
            arguments: {
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: "myTextArea" },
              X:  { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              Y:  { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              W:  { type: Scratch.ArgumentType.NUMBER, defaultValue: 200 },
              H:  { type: Scratch.ArgumentType.NUMBER, defaultValue: 100 },
              PH: { type: Scratch.ArgumentType.STRING, defaultValue: "Enter text…" },
            },
          },
          {
            opcode: "getTextAreaValue",
            blockType: Scratch.BlockType.REPORTER,
            text: "value of textarea [ID]",
            arguments: {
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: "myTextArea" },
            },
          },
          {
            opcode: "setTextAreaValue",
            blockType: Scratch.BlockType.COMMAND,
            text: "set textarea [ID] to [VALUE]",
            arguments: {
              ID:    { type: Scratch.ArgumentType.STRING, defaultValue: "myTextArea" },
              VALUE: { type: Scratch.ArgumentType.STRING, defaultValue: "" },
            },
          },
          {
            opcode: "clearTextArea",
            blockType: Scratch.BlockType.COMMAND,
            text: "clear textarea [ID]",
            arguments: {
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: "myTextArea" },
            },
          },
          {
            opcode: "textAreaChanged",
            blockType: Scratch.BlockType.BOOLEAN,
            text: "textarea [ID] value changed?",
            arguments: {
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: "myTextArea" },
            },
          },

          // ══ PROGRESS BAR ══════════════════════════════════════════════════

          "---",
          {
            blockType: Scratch.BlockType.LABEL,
            text: "── Progress Bar ──",
          },
          {
            opcode: "createProgressBar",
            blockType: Scratch.BlockType.COMMAND,
            text: "create progress bar [ID] at x:[X] y:[Y] w:[W] h:[H] color [COLOR]",
            arguments: {
              ID:    { type: Scratch.ArgumentType.STRING, defaultValue: "myProgress" },
              X:     { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              Y:     { type: Scratch.ArgumentType.NUMBER, defaultValue: 100 },
              W:     { type: Scratch.ArgumentType.NUMBER, defaultValue: 200 },
              H:     { type: Scratch.ArgumentType.NUMBER, defaultValue: 18 },
              COLOR: { type: Scratch.ArgumentType.COLOR,  defaultValue: "#3A86FF" },
            },
          },
          {
            opcode: "setProgressValue",
            blockType: Scratch.BlockType.COMMAND,
            text: "set progress bar [ID] to [VALUE] %",
            arguments: {
              ID:    { type: Scratch.ArgumentType.STRING, defaultValue: "myProgress" },
              VALUE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 50 },
            },
          },
          {
            opcode: "getProgressValue",
            blockType: Scratch.BlockType.REPORTER,
            text: "value of progress bar [ID]",
            arguments: {
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: "myProgress" },
            },
          },
          {
            opcode: "setProgressColor",
            blockType: Scratch.BlockType.COMMAND,
            text: "set progress bar [ID] color [COLOR]",
            arguments: {
              ID:    { type: Scratch.ArgumentType.STRING, defaultValue: "myProgress" },
              COLOR: { type: Scratch.ArgumentType.COLOR,  defaultValue: "#3A86FF" },
            },
          },
          {
            opcode: "setProgressAnimated",
            blockType: Scratch.BlockType.COMMAND,
            text: "set progress bar [ID] animated: [STATE]",
            arguments: {
              ID:    { type: Scratch.ArgumentType.STRING, defaultValue: "myProgress" },
              STATE: { type: Scratch.ArgumentType.STRING, defaultValue: "true", menu: "boolMenu" },
            },
          },

          // ══ RADIO BUTTON GROUP ════════════════════════════════════════════

          "---",
          {
            blockType: Scratch.BlockType.LABEL,
            text: "── Radio Button Group ──",
          },
          {
            opcode: "createRadioGroup",
            blockType: Scratch.BlockType.COMMAND,
            text: "create radio group [ID] at x:[X] y:[Y] options [OPTS] layout [LAYOUT]",
            arguments: {
              ID:     { type: Scratch.ArgumentType.STRING, defaultValue: "myRadio" },
              X:      { type: Scratch.ArgumentType.NUMBER, defaultValue: -100 },
              Y:      { type: Scratch.ArgumentType.NUMBER, defaultValue: 50 },
              OPTS:   { type: Scratch.ArgumentType.STRING, defaultValue: "Option A,Option B,Option C" },
              LAYOUT: { type: Scratch.ArgumentType.STRING, defaultValue: "vertical", menu: "layoutMenu" },
            },
          },
          {
            opcode: "getRadioValue",
            blockType: Scratch.BlockType.REPORTER,
            text: "selected value of radio [ID]",
            arguments: {
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: "myRadio" },
            },
          },
          {
            opcode: "setRadioValue",
            blockType: Scratch.BlockType.COMMAND,
            text: "set radio [ID] selected to [VALUE]",
            arguments: {
              ID:    { type: Scratch.ArgumentType.STRING, defaultValue: "myRadio" },
              VALUE: { type: Scratch.ArgumentType.STRING, defaultValue: "Option A" },
            },
          },
          {
            opcode: "radioChanged",
            blockType: Scratch.BlockType.BOOLEAN,
            text: "radio [ID] changed?",
            arguments: {
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: "myRadio" },
            },
          },

          // ══ TOAST / NOTIFICATION ══════════════════════════════════════════

          "---",
          {
            blockType: Scratch.BlockType.LABEL,
            text: "── Toast / Notification ──",
          },
          {
            opcode: "showToast",
            blockType: Scratch.BlockType.COMMAND,
            text: "show toast [MSG] type [TYPE] for [SECS] seconds",
            arguments: {
              MSG:  { type: Scratch.ArgumentType.STRING, defaultValue: "Done!" },
              TYPE: { type: Scratch.ArgumentType.STRING, defaultValue: "info", menu: "toastTypeMenu" },
              SECS: { type: Scratch.ArgumentType.NUMBER, defaultValue: 3 },
            },
          },
          {
            opcode: "showPersistentToast",
            blockType: Scratch.BlockType.COMMAND,
            text: "show persistent toast [ID] [MSG] type [TYPE]",
            arguments: {
              ID:   { type: Scratch.ArgumentType.STRING, defaultValue: "myToast" },
              MSG:  { type: Scratch.ArgumentType.STRING, defaultValue: "Loading…" },
              TYPE: { type: Scratch.ArgumentType.STRING, defaultValue: "info", menu: "toastTypeMenu" },
            },
          },
          {
            opcode: "updateToastMessage",
            blockType: Scratch.BlockType.COMMAND,
            text: "update toast [ID] message to [MSG]",
            arguments: {
              ID:  { type: Scratch.ArgumentType.STRING, defaultValue: "myToast" },
              MSG: { type: Scratch.ArgumentType.STRING, defaultValue: "Complete!" },
            },
          },
          {
            opcode: "dismissToast",
            blockType: Scratch.BlockType.COMMAND,
            text: "dismiss toast [ID]",
            arguments: {
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: "myToast" },
            },
          },

          // ══ MODAL / DIALOG ════════════════════════════════════════════════

          "---",
          {
            blockType: Scratch.BlockType.LABEL,
            text: "── Modal / Dialog ──",
          },
          {
            opcode: "createModal",
            blockType: Scratch.BlockType.COMMAND,
            text: "create modal [ID] title [TITLE] message [MSG] w:[W] h:[H]",
            arguments: {
              ID:    { type: Scratch.ArgumentType.STRING, defaultValue: "myModal" },
              TITLE: { type: Scratch.ArgumentType.STRING, defaultValue: "Notice" },
              MSG:   { type: Scratch.ArgumentType.STRING, defaultValue: "Are you sure?" },
              W:     { type: Scratch.ArgumentType.NUMBER, defaultValue: 280 },
              H:     { type: Scratch.ArgumentType.NUMBER, defaultValue: 180 },
            },
          },
          {
            opcode: "showModal",
            blockType: Scratch.BlockType.COMMAND,
            text: "show modal [ID]",
            arguments: {
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: "myModal" },
            },
          },
          {
            opcode: "hideModal",
            blockType: Scratch.BlockType.COMMAND,
            text: "hide modal [ID]",
            arguments: {
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: "myModal" },
            },
          },
          {
            opcode: "addModalButton",
            blockType: Scratch.BlockType.COMMAND,
            text: "add button [BTN_ID] label [LABEL] color [COLOR] to modal [ID]",
            arguments: {
              BTN_ID: { type: Scratch.ArgumentType.STRING, defaultValue: "okBtn" },
              LABEL:  { type: Scratch.ArgumentType.STRING, defaultValue: "OK" },
              COLOR:  { type: Scratch.ArgumentType.COLOR,  defaultValue: "#3A86FF" },
              ID:     { type: Scratch.ArgumentType.STRING, defaultValue: "myModal" },
            },
          },
          {
            opcode: "setModalTitle",
            blockType: Scratch.BlockType.COMMAND,
            text: "set modal [ID] title to [TITLE]",
            arguments: {
              ID:    { type: Scratch.ArgumentType.STRING, defaultValue: "myModal" },
              TITLE: { type: Scratch.ArgumentType.STRING, defaultValue: "Warning" },
            },
          },
          {
            opcode: "setModalMessage",
            blockType: Scratch.BlockType.COMMAND,
            text: "set modal [ID] message to [MSG]",
            arguments: {
              ID:  { type: Scratch.ArgumentType.STRING, defaultValue: "myModal" },
              MSG: { type: Scratch.ArgumentType.STRING, defaultValue: "Something happened." },
            },
          },
          {
            opcode: "isModalVisible",
            blockType: Scratch.BlockType.BOOLEAN,
            text: "modal [ID] visible?",
            arguments: {
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: "myModal" },
            },
          },

          // ══ UNIVERSAL CONTROLS ════════════════════════════════════════════

          "---",
          {
            blockType: Scratch.BlockType.LABEL,
            text: "── Universal Controls ──",
          },
          {
            opcode: "setWidgetImageURL",
            blockType: Scratch.BlockType.COMMAND,
            text: "set [ID] image url to [URL]",
            arguments: {
              ID:  { type: Scratch.ArgumentType.STRING, defaultValue: "myWidget" },
              URL: { type: Scratch.ArgumentType.STRING,
                     defaultValue: "https://extensions.turbowarp.org/dango.png" },
            },
          },
          {
            opcode: "setWidgetImageFromCostume",
            blockType: Scratch.BlockType.COMMAND,
            text: "set [ID] image from costume [COSTUME] of sprite [SPRITE]",
            arguments: {
              ID:      { type: Scratch.ArgumentType.STRING, defaultValue: "myWidget" },
              COSTUME: { type: Scratch.ArgumentType.STRING, defaultValue: "costume1" },
              SPRITE:  { type: Scratch.ArgumentType.STRING, defaultValue: "Sprite1" },
            },
          },
          {
            opcode: "setWidgetImageOpacity",
            blockType: Scratch.BlockType.COMMAND,
            text: "set [ID] image opacity [OPACITY] %",
            arguments: {
              ID:      { type: Scratch.ArgumentType.STRING, defaultValue: "myWidget" },
              OPACITY: { type: Scratch.ArgumentType.NUMBER, defaultValue: 100 },
            },
          },
          {
            opcode: "setWidgetImageFit",
            blockType: Scratch.BlockType.COMMAND,
            text: "set [ID] image fit [FIT]",
            arguments: {
              ID:  { type: Scratch.ArgumentType.STRING, defaultValue: "myWidget" },
              FIT: { type: Scratch.ArgumentType.STRING, defaultValue: "contain", menu: "fitMenu" },
            },
          },
          {
            opcode: "setTextStyle",
            blockType: Scratch.BlockType.COMMAND,
            text: "set text style of [ID] font:[FONT] size:[SIZE] color:[COLOR] bold:[BOLD]",
            arguments: {
              ID:    { type: Scratch.ArgumentType.STRING, defaultValue: "myWidget" },
              FONT:  { type: Scratch.ArgumentType.STRING, defaultValue: "Inter", menu: "fontMenu" },
              SIZE:  { type: Scratch.ArgumentType.NUMBER, defaultValue: 16 },
              COLOR: { type: Scratch.ArgumentType.COLOR,  defaultValue: "#000000" },
              BOLD:  { type: Scratch.ArgumentType.STRING, defaultValue: "false", menu: "boolMenu" },
            },
          },
          {
            opcode: "moveWidget",
            blockType: Scratch.BlockType.COMMAND,
            text: "move [ID] to x:[X] y:[Y]",
            arguments: {
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: "myWidget" },
              X:  { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              Y:  { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
            },
          },
          {
            opcode: "shiftWidget",
            blockType: Scratch.BlockType.COMMAND,
            text: "shift [ID] by dx:[DX] dy:[DY]",
            arguments: {
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: "myWidget" },
              DX: { type: Scratch.ArgumentType.NUMBER, defaultValue: 10 },
              DY: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
            },
          },
          {
            opcode: "resizeWidget",
            blockType: Scratch.BlockType.COMMAND,
            text: "resize [ID] to w:[W] h:[H]",
            arguments: {
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: "myWidget" },
              W:  { type: Scratch.ArgumentType.NUMBER, defaultValue: 120 },
              H:  { type: Scratch.ArgumentType.NUMBER, defaultValue: 36 },
            },
          },
          {
            opcode: "getWidgetX",
            blockType: Scratch.BlockType.REPORTER,
            text: "x of [ID]",
            arguments: {
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: "myWidget" },
            },
          },
          {
            opcode: "getWidgetY",
            blockType: Scratch.BlockType.REPORTER,
            text: "y of [ID]",
            arguments: {
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: "myWidget" },
            },
          },
          {
            opcode: "setVisible",
            blockType: Scratch.BlockType.COMMAND,
            text: "set [ID] visible: [STATE]",
            arguments: {
              ID:    { type: Scratch.ArgumentType.STRING, defaultValue: "myWidget" },
              STATE: { type: Scratch.ArgumentType.STRING, defaultValue: "true", menu: "boolMenu" },
            },
          },
          {
            opcode: "isVisible",
            blockType: Scratch.BlockType.BOOLEAN,
            text: "widget [ID] visible?",
            arguments: {
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: "myWidget" },
            },
          },
          {
            opcode: "setOpacity",
            blockType: Scratch.BlockType.COMMAND,
            text: "set [ID] opacity [OPACITY] %",
            arguments: {
              ID:      { type: Scratch.ArgumentType.STRING, defaultValue: "myWidget" },
              OPACITY: { type: Scratch.ArgumentType.NUMBER, defaultValue: 100 },
            },
          },
          {
            opcode: "setZIndex",
            blockType: Scratch.BlockType.COMMAND,
            text: "set [ID] z-layer to [Z]",
            arguments: {
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: "myWidget" },
              Z:  { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 },
            },
          },
          {
            opcode: "bringToFront",
            blockType: Scratch.BlockType.COMMAND,
            text: "bring [ID] to front",
            arguments: {
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: "myWidget" },
            },
          },
          {
            opcode: "sendToBack",
            blockType: Scratch.BlockType.COMMAND,
            text: "send [ID] to back",
            arguments: {
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: "myWidget" },
            },
          },
          {
            opcode: "deleteWidget",
            blockType: Scratch.BlockType.COMMAND,
            text: "delete widget [ID]",
            arguments: {
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: "myWidget" },
            },
          },
          {
            opcode: "deleteAllWidgets",
            blockType: Scratch.BlockType.COMMAND,
            text: "delete all widgets",
          },
        ],

        menus: {
          boolMenu: {
            acceptReporters: true,
            items: ["true", "false"],
          },
          fitMenu: {
            acceptReporters: true,
            items: ["contain", "cover", "fill", "none"],
          },
          alignMenu: {
            acceptReporters: false,
            items: ["left", "center", "right", "justify"],
          },
          layoutMenu: {
            acceptReporters: false,
            items: ["vertical", "horizontal"],
          },
          toastTypeMenu: {
            acceptReporters: false,
            items: ["info", "success", "warning", "error"],
          },
          fontMenu: {
            acceptReporters: true,
            items: [
              "Inter",
              "Roboto",
              "Open Sans",
              "Noto Sans",
              "Lato",
              "Montserrat",
              "Source Sans 3",
              "Be Vietnam Pro",
              "Nunito",
              "Mulish",
            ],
          },
        },
      };
    }

    // ══ TEXT LABEL ════════════════════════════════════════════════════════════

    createText({ ID, X, Y, MAXW, TEXT }) {
      const el = document.createElement("div");
      const maxW = Number(MAXW);
      Object.assign(el.style, {
        pointerEvents: "none",
        fontFamily:    "sans-serif",
        fontSize:      "16px",
        color:         "#000000",
        whiteSpace:    "pre-wrap",
        userSelect:    "none",
        maxWidth:      maxW > 0 ? maxW + "px" : "none",
        wordBreak:     maxW > 0 ? "break-word" : "normal",
      });
      el.textContent = String(TEXT);
      applyGeometry(el, Number(X), Number(Y), 0, 0, String(ID).trim());
      registerWidget(String(ID).trim(), el);
    }

    setTextAlign({ ID, ALIGN }) {
      const el = getWidget(ID);
      const allowed = ["left", "center", "right", "justify"];
      if (el) el.style.textAlign = allowed.includes(ALIGN) ? ALIGN : "left";
    }

    setTextContent({ ID, TEXT }) {
      const el = getWidget(ID);
      if (el) el.textContent = String(TEXT);
    }

    getTextContent({ ID }) {
      const el = getWidget(ID);
      return el ? el.textContent : "";
    }

    setTextStyle({ ID, FONT, SIZE, COLOR, BOLD }) {
      const root = getWidget(ID);
      if (!root) return;

      // Load the Google Font once if not already injected.
      const fontName = String(FONT).trim();
      if (fontName && fontName !== "sans-serif") {
        const linkId = "gf-" + fontName.replace(/\s+/g, "-");
        if (!document.getElementById(linkId)) {
          const link  = document.createElement("link");
          link.id     = linkId;
          link.rel    = "stylesheet";
          link.href   = "https://fonts.googleapis.com/css2?family="
                        + encodeURIComponent(fontName).replace(/%20/g, "+")
                        + ":wght@400;700&display=swap";
          document.head.appendChild(link);
        }
      }

      const family     = fontName || "sans-serif";
      const fontSize   = Number(SIZE) + "px";
      const color      = parseColor(COLOR);
      const fontWeight = BOLD === "true" ? "bold" : "normal";

      // Apply styles to the root element and every text-bearing descendant
      // so the change works for labels, buttons, checkboxes, dropdowns, etc.
      const targets = [root, ...root.querySelectorAll(
        "span, label, input, select, option, div, p"
      )];

      targets.forEach(node => {
        // Skip the hidden <img> inside buttons.
        if (node.tagName === "IMG") return;
        node.style.fontFamily  = "'" + family + "', sans-serif";
        node.style.fontSize    = fontSize;
        node.style.fontWeight  = fontWeight;
        // Only apply color to text-producing elements, not containers.
        const tag = node.tagName.toUpperCase();
        if (["SPAN", "LABEL", "DIV", "P", "SELECT", "BUTTON"].includes(tag)) {
          node.style.color = color;
        }
      });
    }

    // ══ BUTTON ════════════════════════════════════════════════════════════════

    /** Wire click tracking onto a button. id = the widget ID string. */
    _initButton(el, id) {
      clickLatches[id] = false;
      clickCounts[id]  = 0;
      // pointerdown fires before any document-level preventDefault() from the
      // TurboWarp/PenguinMod runtime can cancel the event chain. Listeners on
      // the element itself always receive the event before document listeners.
      el.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        el.style.filter     = "brightness(0.85)";
        clickLatches[id]    = true;
        clickCounts[id]++;
      });
      el.addEventListener("pointerup",   (e) => { e.stopPropagation(); el.style.filter = ""; });
      el.addEventListener("pointerleave",() => { el.style.filter = ""; });
    }

    createButton({ ID, X, Y, W, H, LABEL }) {
      const el = document.createElement("button");
      Object.assign(el.style, {
        pointerEvents:  "auto",
        cursor:         "pointer",
        fontFamily:     "sans-serif",
        fontSize:       "14px",
        background:     "#3A86FF",
        color:          "#FFFFFF",
        border:         "none",
        borderRadius:   "6px",
        padding:        "0 12px",
        boxShadow:      "0 2px 6px rgba(0,0,0,0.25)",
        transition:     "filter 0.1s",
        position:       "relative",
        overflow:       "hidden",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        gap:            "6px",
      });

      // Text span — always present so label and image can coexist.
      const span = document.createElement("span");
      span.textContent  = String(LABEL);
      span.style.pointerEvents = "none";
      span.style.position      = "relative"; // sits above img layer
      span.style.zIndex        = "1";
      el.appendChild(span);

      // Hidden image layer — revealed when setButtonImage is called.
      const img = document.createElement("img");
      img.draggable = false;
      Object.assign(img.style, {
        display:       "none",
        position:      "absolute",
        inset:         "0",
        width:         "100%",
        height:        "100%",
        objectFit:     "contain",
        pointerEvents: "none",
        zIndex:        "0",
      });
      el.appendChild(img);

      this._initButton(el, String(ID).trim());
      applyGeometry(el, Number(X), Number(Y), Number(W), Number(H), String(ID).trim());
      registerWidget(String(ID).trim(), el);
    }

    // ── Shared button operations ──────────────────────────────────────────────

    setButtonLabel({ ID, LABEL }) {
      const el = getWidget(ID);
      if (!el) return;
      const span = el.querySelector("span");
      if (span) span.textContent = String(LABEL);
    }

    setButtonColor({ ID, BG, FG }) {
      const el = getWidget(ID);
      if (!el) return;
      el.style.background = parseColor(BG);
      el.style.color      = parseColor(FG);
    }

    setButtonEnabled({ ID, STATE }) {
      const el = getWidget(ID);
      if (!el) return;
      el.disabled       = STATE !== "true";
      el.style.opacity  = STATE === "true" ? "1" : "0.45";
      el.style.cursor   = STATE === "true" ? "pointer" : "not-allowed";
    }

    buttonWasClicked({ ID }) {
      const id = String(ID).trim();
      if (clickLatches[id]) {
        clickLatches[id] = false;
        return true;
      }
      return false;
    }

    buttonClickCount({ ID }) {
      return clickCounts[String(ID).trim()] || 0;
    }

    resetButtonClicks({ ID }) {
      const id = String(ID).trim();
      clickLatches[id] = false;
      clickCounts[id]  = 0;
    }

    // ══ TEXT BOX ══════════════════════════════════════════════════════════════

    createTextBox({ ID, X, Y, W, PH }) {
      const id = String(ID).trim();
      const el = document.createElement("input");
      el.type        = "text";
      el.placeholder = String(PH);
      eventLatches[id + "_changed"] = false;
      eventLatches[id + "_enter"]   = false;
      Object.assign(el.style, {
        pointerEvents: "auto",
        fontFamily:    "sans-serif",
        fontSize:      "14px",
        padding:       "4px 8px",
        border:        "1.5px solid #CBD5E1",
        borderRadius:  "6px",
        outline:       "none",
        background:    "#FFFFFF",
        color:         "#000000",
        height:        "32px",
      });
      el.addEventListener("focus",   () => { el.style.border = "1.5px solid #3A86FF"; });
      el.addEventListener("blur",    () => { el.style.border = "1.5px solid #CBD5E1"; });
      el.addEventListener("input",   () => { eventLatches[id + "_changed"] = true; });
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter") eventLatches[id + "_enter"] = true;
      }, { capture: true });
      applyGeometry(el, Number(X), Number(Y), Number(W), 32, String(ID).trim());
      registerWidget(id, el);
    }

    getTextBoxValue({ ID }) {
      const el = getWidget(ID);
      return el ? el.value : "";
    }

    setTextBoxValue({ ID, VALUE }) {
      const el = getWidget(ID);
      if (el) el.value = String(VALUE);
    }

    clearTextBox({ ID }) {
      const id = String(ID).trim();
      const el = getWidget(id);
      if (el) {
        el.value = "";
        eventLatches[id + "_changed"] = false;
        eventLatches[id + "_enter"]   = false;
      }
    }

    setTextBoxPlaceholder({ ID, PH }) {
      const el = getWidget(ID);
      if (el) el.placeholder = String(PH);
    }

    focusTextBox({ ID }) {
      const el = getWidget(ID);
      if (el) el.focus();
    }

    textBoxChanged({ ID }) {
      const key = String(ID).trim() + "_changed";
      if (eventLatches[key]) { eventLatches[key] = false; return true; }
      return false;
    }

    textBoxEnterPressed({ ID }) {
      const key = String(ID).trim() + "_enter";
      if (eventLatches[key]) { eventLatches[key] = false; return true; }
      return false;
    }

    // ══ IMAGE ═════════════════════════════════════════════════════════════════

    createImage({ ID, X, Y, W, H, URL }) {
      const el = document.createElement("img");
      el.src       = String(URL);
      el.draggable = false;
      Object.assign(el.style, {
        pointerEvents: "none",
        objectFit:     "contain",
      });
      applyGeometry(el, Number(X), Number(Y), Number(W), Number(H), String(ID).trim());
      registerWidget(String(ID).trim(), el);
    }

    // ── Universal image helpers ───────────────────────────────────────────────

    /**
     * Returns the <img> element to target for a widget, regardless of type:
     *  - "image"  → the widget IS an <img>, return it directly
     *  - "button" → return the hidden <img> child inside the button
     *  - "panel"  → find or create a background <img> child inside the panel
     * Returns null for unsupported types (checkbox, slider, dropdown, etc.)
     */
    _getImageEl(id) {
      const el   = getWidget(id);
      if (!el) return null;
      const type = el.tagName.toUpperCase();

      // Image widget — the element itself is the <img>
      if (type === "IMG") return el;

      // Button — has a hidden <img> built in during createButton
      if (type === "BUTTON") {
        return el.querySelector("img") || null;
      }

      // Panel — find or lazily create a background <img> layer
      if (type === "DIV" && el.style.overflow === "hidden") {
        let img = el.querySelector(":scope > img.panel-bg");
        if (!img) {
          img = document.createElement("img");
          img.className  = "panel-bg";
          img.draggable  = false;
          Object.assign(img.style, {
            position:      "absolute",
            inset:         "0",
            width:         "100%",
            height:        "100%",
            objectFit:     "cover",
            pointerEvents: "none",
            zIndex:        "0",
            display:       "none",
          });
          el.insertBefore(img, el.firstChild);
        }
        return img;
      }

      return null;  // unsupported widget type
    }

    /** Universal: set image URL on button, image widget, or panel. */
    setWidgetImageURL({ ID, URL }) {
      const id  = String(ID).trim();
      const el  = getWidget(id);
      const img = this._getImageEl(id);
      if (!img) return;
      const url = String(URL).trim();

      if (el && el.tagName.toUpperCase() === "BUTTON") {
        // Button: toggle transparent mode when image is set/cleared
        if (url === "") {
          img.style.display   = "none";
          img.src             = "";
          el.style.padding    = "0 12px";
          el.style.background = el.dataset.origBg     || "#3A86FF";
          el.style.border     = el.dataset.origBorder  || "none";
          el.style.boxShadow  = el.dataset.origShadow  || "0 2px 6px rgba(0,0,0,0.25)";
        } else {
          if (!el.dataset.origBg) {
            el.dataset.origBg     = el.style.background || "#3A86FF";
            el.dataset.origBorder = el.style.border      || "none";
            el.dataset.origShadow = el.style.boxShadow   || "0 2px 6px rgba(0,0,0,0.25)";
          }
          img.src             = url;
          img.style.display   = "block";
          el.style.padding    = "0";
          el.style.background = "transparent";
          el.style.border     = "none";
          el.style.boxShadow  = "none";
        }
      } else if (el && el.tagName.toUpperCase() === "DIV") {
        // Panel: show/hide the background img layer
        if (url === "") {
          img.style.display = "none";
          img.src = "";
        } else {
          img.src           = url;
          img.style.display = "block";
        }
      } else {
        // Image widget: set src directly
        img.src = url;
      }
    }

    /** Universal: set image from costume on button, image widget, or panel. */
    setWidgetImageFromCostume({ ID, COSTUME, SPRITE }) {
      const url = this._costumeURL(String(SPRITE).trim(), String(COSTUME).trim());
      if (url) this.setWidgetImageURL({ ID, URL: url });
    }

    /** Universal: set image opacity on button, image widget, or panel. */
    setWidgetImageOpacity({ ID, OPACITY }) {
      const img = this._getImageEl(String(ID).trim());
      if (img) img.style.opacity = String(
        Math.max(0, Math.min(100, Number(OPACITY))) / 100
      );
    }

    /** Universal: set image fit on button, image widget, or panel. */
    setWidgetImageFit({ ID, FIT }) {
      const img     = this._getImageEl(String(ID).trim());
      const allowed = ["contain", "cover", "fill", "none"];
      if (img) img.style.objectFit = allowed.includes(FIT) ? FIT : "contain";
    }

    /**
     * Reads a costume's raw asset bytes directly from the Scratch VM asset store
     * and returns a blob URL — the original file untouched, best possible quality.
     *
     * Strategy (each tried in order, stops at first success):
     *  1. runtime.assets (VM asset store) — raw original bytes, lossless.
     *  2. costume.asset.data (Uint8Array on the costume object itself).
     *  3. SVG costumes → inline data URL from svgString.
     *  4. Canvas fallback — last resort, may lose quality for photos.
     *
     * Returns a URL string, or null if the costume is not found.
     */
    _costumeURL(spriteName, costumeName) {
      const runtime = this.runtime;

      // Find the target (sprite or stage).
      const target =
        runtime.targets.find(t => t.sprite && t.sprite.name === spriteName) ||
        (spriteName.toLowerCase() === "stage" ? runtime.targets.find(t => t.isStage) : null);

      if (!target) return null;

      // Find the costume by name.
      const costume = target.sprite.costumes.find(
        c => c.name === costumeName
      );
      if (!costume) return null;

      // ── Strategy 1: raw asset bytes from VM asset store ───────────────────
      // costume.assetId is the MD5 hash; runtime.assets is the asset storage map.
      const assetId = costume.assetId;
      const dataFormat = costume.dataFormat || "png";

      if (assetId && runtime.assets && runtime.assets[assetId + "." + dataFormat]) {
        const asset = runtime.assets[assetId + "." + dataFormat];
        if (asset && asset.data) {
          const blob = new Blob([asset.data], {
            type: dataFormat === "svg" ? "image/svg+xml" : "image/" + dataFormat,
          });
          return URL.createObjectURL(blob);
        }
      }

      // ── Strategy 2: costume.asset.data (Uint8Array) ───────────────────────
      if (costume.asset && costume.asset.data) {
        const fmt = costume.asset.dataFormat || dataFormat;
        const blob = new Blob([costume.asset.data], {
          type: fmt === "svg" ? "image/svg+xml" : "image/" + fmt,
        });
        return URL.createObjectURL(blob);
      }

      // ── Strategy 3: SVG inline string ─────────────────────────────────────
      if (costume.svgString) {
        const blob = new Blob([costume.svgString], { type: "image/svg+xml" });
        return URL.createObjectURL(blob);
      }

      // ── Strategy 4: canvas fallback (last resort) ─────────────────────────
      // Uses the skin already rendered by the VM renderer.
      try {
        const skinId = costume.skinId;
        const skin   = runtime.renderer && runtime.renderer._allSkins &&
                       runtime.renderer._allSkins[skinId];
        if (skin) {
          // BitmapSkin exposes _texture or a canvas.
          const canvas = skin._canvas || (skin._texture && skin._texture.canvas);
          if (canvas) return canvas.toDataURL("image/png");
        }
      } catch (_) { /* ignore */ }

      return null;
    }

    /** Create an image widget from a sprite costume — original quality. */
    createImageFromCostume({ ID, X, Y, W, H, COSTUME, SPRITE }) {
      const url = this._costumeURL(String(SPRITE).trim(), String(COSTUME).trim());
      const el  = document.createElement("img");
      el.src       = url || "";
      el.draggable = false;
      Object.assign(el.style, {
        pointerEvents: "none",
        objectFit:     "contain",
      });
      applyGeometry(el, Number(X), Number(Y), Number(W), Number(H), String(ID).trim());
      registerWidget(String(ID).trim(), el);
    }

    setImageSize({ ID, W, H }) {
      const el = getWidget(ID);
      if (el) {
        el.style.width  = Number(W) + "px";
        el.style.height = Number(H) + "px";
      }
    }

    // ══ CHECKBOX ══════════════════════════════════════════════════════════════

    createCheckbox({ ID, X, Y, LABEL }) {
      const id      = String(ID).trim();
      const wrapper = document.createElement("label");
      Object.assign(wrapper.style, {
        pointerEvents: "auto",
        display:       "flex",
        alignItems:    "center",
        gap:           "6px",
        fontFamily:    "sans-serif",
        fontSize:      "14px",
        cursor:        "pointer",
        userSelect:    "none",
        color:         "#000000",
      });
      const cb = document.createElement("input");
      cb.type         = "checkbox";
      cb.style.width  = cb.style.height = "16px";
      cb.style.cursor = "pointer";
      eventLatches[id] = false;
      cb.addEventListener("change", () => { eventLatches[id] = true; }, { capture: true });
      const span       = document.createElement("span");
      span.textContent = String(LABEL);
      wrapper.appendChild(cb);
      wrapper.appendChild(span);
      applyGeometry(wrapper, Number(X), Number(Y), 0, 24, String(ID).trim());
      registerWidget(id, wrapper);
    }

    isChecked({ ID }) {
      const el = getWidget(ID);
      if (!el) return false;
      const cb = el.querySelector("input[type=checkbox]");
      return cb ? cb.checked : false;
    }

    setChecked({ ID, STATE }) {
      const el = getWidget(ID);
      if (!el) return;
      const cb = el.querySelector("input[type=checkbox]");
      if (cb) cb.checked = STATE === "true";
    }

    checkboxChanged({ ID }) {
      const id = String(ID).trim();
      if (eventLatches[id]) { eventLatches[id] = false; return true; }
      return false;
    }

    // ══ SLIDER ════════════════════════════════════════════════════════════════

    createSlider({ ID, X, Y, W, MIN, MAX, VAL }) {
      const id = String(ID).trim();
      const el = document.createElement("input");
      el.type  = "range";
      el.min   = String(MIN);
      el.max   = String(MAX);
      el.value = String(VAL);
      Object.assign(el.style, {
        pointerEvents: "auto",
        cursor:        "pointer",
        accentColor:   "#3A86FF",
        height:        "20px",
      });
      eventLatches[id] = false;
      el.addEventListener("input", () => { eventLatches[id] = true; });
      applyGeometry(el, Number(X), Number(Y), Number(W), 20, String(ID).trim());
      registerWidget(id, el);
    }

    getSliderValue({ ID }) {
      const el = getWidget(ID);
      return el ? Number(el.value) : 0;
    }

    setSliderValue({ ID, VAL }) {
      const el = getWidget(ID);
      if (el) el.value = String(VAL);
    }

    sliderChanged({ ID }) {
      const id = String(ID).trim();
      if (eventLatches[id]) { eventLatches[id] = false; return true; }
      return false;
    }

    // ══ DROPDOWN ══════════════════════════════════════════════════════════════

    _populateSelect(el, optsStr) {
      el.innerHTML = "";
      optsStr.split(",").map(o => o.trim()).filter(Boolean).forEach(opt => {
        const o       = document.createElement("option");
        o.value       = opt;
        o.textContent = opt;
        el.appendChild(o);
      });
    }

    createDropdown({ ID, X, Y, W, OPTS }) {
      const id = String(ID).trim();
      const el = document.createElement("select");
      Object.assign(el.style, {
        pointerEvents: "auto",
        fontFamily:    "sans-serif",
        fontSize:      "14px",
        padding:       "4px 8px",
        border:        "1.5px solid #CBD5E1",
        borderRadius:  "6px",
        background:    "#FFFFFF",
        color:         "#000000",
        cursor:        "pointer",
        height:        "32px",
      });
      eventLatches[id] = false;
      el.addEventListener("change", () => { eventLatches[id] = true; }, { capture: true });
      this._populateSelect(el, String(OPTS));
      applyGeometry(el, Number(X), Number(Y), Number(W), 32, String(ID).trim());
      registerWidget(id, el);
    }

    getDropdownValue({ ID }) {
      const el = getWidget(ID);
      return el ? el.value : "";
    }

    setDropdownOptions({ ID, OPTS }) {
      const el = getWidget(ID);
      if (el) this._populateSelect(el, String(OPTS));
    }

    setDropdownSelected({ ID, VALUE }) {
      const el = getWidget(ID);
      if (el) el.value = String(VALUE);
    }

    dropdownChanged({ ID }) {
      const id = String(ID).trim();
      if (eventLatches[id]) { eventLatches[id] = false; return true; }
      return false;
    }

    // ══ PANEL ═════════════════════════════════════════════════════════════════

    createPanel({ ID, X, Y, W, H, COLOR }) {
      const id = String(ID).trim();
      const el = document.createElement("div");
      Object.assign(el.style, {
        pointerEvents: "none",
        background:    parseColor(COLOR),
        borderRadius:  "10px",
        boxShadow:     "0 4px 16px rgba(0,0,0,0.15)",
        border:        "1px solid rgba(0,0,0,0.08)",
        overflow:      "hidden",   // clips children to panel bounds
      });
      applyGeometry(el, Number(X), Number(Y), Number(W), Number(H), id);
      panelChildren[id] = new Set();
      registerWidget(id, el);
    }

    setPanelColor({ ID, COLOR }) {
      const el = getWidget(ID);
      if (el) el.style.background = parseColor(COLOR);
    }

    addToPanel({ CHILD, ID }) {
      const childId  = String(CHILD).trim();
      const panelId  = String(ID).trim();
      const panel    = getWidget(panelId);
      const childEl  = getWidget(childId);
      if (!panel || !childEl) return;

      // If already in another panel, remove it first.
      const prevPanel = childPanel[childId];
      if (prevPanel && prevPanel !== panelId) {
        this.removeFromPanel({ CHILD: childId, ID: prevPanel });
      }

      const s = _scale();

      // Compute child's current absolute logical stage position (its center)
      // using its already-tracked geometry, falling back to live pixels.
      let childLogicalX, childLogicalY;
      const childG = geomRegistry[childId];
      if (childG) {
        childLogicalX = childG.x;
        childLogicalY = childG.y;
      } else {
        childLogicalX = this.getWidgetX({ ID: childId });
        childLogicalY = this.getWidgetY({ ID: childId });
      }

      // Panel's logical center position.
      const panelG = geomRegistry[panelId];
      const panelLogicalX = panelG ? panelG.x : 0;
      const panelLogicalY = panelG ? panelG.y : 0;

      // Store the child's geometry as an OFFSET from the panel's center, in
      // logical units — this is what _rescalePanelChildren() expects.
      const offsetX = childLogicalX - panelLogicalX;
      const offsetY = childLogicalY - panelLogicalY;
      geomRegistry[childId] = {
        x: offsetX,
        y: offsetY,
        w: childG ? childG.w : 0,
        h: childG ? childG.h : 0,
        fontSize: childG ? childG.fontSize : 0,
      };

      // Reparent: move child DOM node into panel element.
      panel.appendChild(childEl);

      // Panel itself needs pointer-events auto so children receive events.
      panel.style.pointerEvents = "auto";

      // Track the relationship, then immediately paint the child at its
      // correct panel-relative pixel position.
      if (!panelChildren[panelId]) panelChildren[panelId] = new Set();
      panelChildren[panelId].add(childId);
      childPanel[childId] = panelId;

      _rescalePanelChildren(s);
    }

    removeFromPanel({ CHILD, ID }) {
      const childId = String(CHILD).trim();
      const panelId = String(ID).trim();
      const panel   = getWidget(panelId);
      const childEl = getWidget(childId);
      if (!panel || !childEl) return;

      const s = _scale();

      // Convert the stored panel-relative logical offset back into an
      // absolute logical stage position before detaching.
      const childG = geomRegistry[childId];
      const panelG = geomRegistry[panelId];
      if (childG && panelG) {
        geomRegistry[childId] = {
          x: panelG.x + childG.x,
          y: panelG.y + childG.y,
          w: childG.w,
          h: childG.h,
          fontSize: childG.fontSize,
        };
      }

      getOverlay().appendChild(childEl);

      if (panelChildren[panelId]) panelChildren[panelId].delete(childId);
      delete childPanel[childId];

      // If panel has no more children, reset pointer-events.
      if (!panelChildren[panelId] || panelChildren[panelId].size === 0) {
        panel.style.pointerEvents = "none";
      }

      // Repaint the child at its correct absolute overlay position.
      const g = geomRegistry[childId];
      if (g) _writeGeometryPx(childEl, g, s);
    }

    // ══ TEXT AREA ══════════════════════════════════════════════════════════════

    createTextArea({ ID, X, Y, W, H, PH }) {
      const id = String(ID).trim();
      const el = document.createElement("textarea");
      el.placeholder = String(PH);
      eventLatches[id] = false;
      Object.assign(el.style, {
        pointerEvents: "auto",
        fontFamily:    "sans-serif",
        fontSize:      "14px",
        padding:       "6px 8px",
        border:        "1.5px solid #CBD5E1",
        borderRadius:  "6px",
        outline:       "none",
        background:    "#FFFFFF",
        color:         "#000000",
        resize:        "none",
        lineHeight:    "1.5",
        boxSizing:     "border-box",
      });
      el.addEventListener("focus", () => { el.style.border = "1.5px solid #3A86FF"; });
      el.addEventListener("blur",  () => { el.style.border = "1.5px solid #CBD5E1"; });
      el.addEventListener("input", () => { eventLatches[id] = true; });
      applyGeometry(el, Number(X), Number(Y), Number(W), Number(H), String(ID).trim());
      registerWidget(id, el);
    }

    getTextAreaValue({ ID }) {
      const el = getWidget(ID);
      return el ? el.value : "";
    }

    setTextAreaValue({ ID, VALUE }) {
      const el = getWidget(ID);
      if (el) el.value = String(VALUE);
    }

    clearTextArea({ ID }) {
      const id = String(ID).trim();
      const el = getWidget(id);
      if (el) { el.value = ""; eventLatches[id] = false; }
    }

    textAreaChanged({ ID }) {
      const id = String(ID).trim();
      if (eventLatches[id]) { eventLatches[id] = false; return true; }
      return false;
    }

    // ══ PROGRESS BAR ══════════════════════════════════════════════════════════

    createProgressBar({ ID, X, Y, W, H, COLOR }) {
      // Outer track
      const track = document.createElement("div");
      Object.assign(track.style, {
        pointerEvents: "none",
        background:    "#E2E8F0",
        borderRadius:  "999px",
        overflow:      "hidden",
        position:      "relative",
      });

      // Filled bar
      const fill = document.createElement("div");
      fill.dataset.value = "0";
      Object.assign(fill.style, {
        width:         "0%",
        height:        "100%",
        background:    parseColor(COLOR),
        borderRadius:  "999px",
        transition:    "width 0.3s ease",
      });

      // Inject stripe-animation keyframe once
      if (!document.getElementById("gui-progress-style")) {
        const s = document.createElement("style");
        s.id = "gui-progress-style";
        s.textContent = `
          @keyframes gui-stripe {
            from { background-position: 0 0; }
            to   { background-position: 40px 0; }
          }
          .gui-progress-animated {
            background-image: linear-gradient(
              45deg,
              rgba(255,255,255,0.20) 25%, transparent 25%,
              transparent 50%, rgba(255,255,255,0.20) 50%,
              rgba(255,255,255,0.20) 75%, transparent 75%, transparent
            );
            background-size: 40px 40px;
            animation: gui-stripe 1s linear infinite;
          }`;
        document.head.appendChild(s);
      }

      track.appendChild(fill);
      applyGeometry(track, Number(X), Number(Y), Number(W), Number(H), String(ID).trim());
      registerWidget(String(ID).trim(), track);
    }

    setProgressValue({ ID, VALUE }) {
      const track = getWidget(ID);
      if (!track) return;
      const fill = track.firstChild;
      if (!fill) return;
      const pct = Math.max(0, Math.min(100, Number(VALUE)));
      fill.style.width   = pct + "%";
      fill.dataset.value = String(pct);
    }

    getProgressValue({ ID }) {
      const track = getWidget(ID);
      if (!track || !track.firstChild) return 0;
      return Number(track.firstChild.dataset.value || 0);
    }

    setProgressColor({ ID, COLOR }) {
      const track = getWidget(ID);
      if (!track || !track.firstChild) return;
      track.firstChild.style.background = parseColor(COLOR);
    }

    setProgressAnimated({ ID, STATE }) {
      const track = getWidget(ID);
      if (!track || !track.firstChild) return;
      const fill = track.firstChild;
      if (STATE === "true") {
        fill.classList.add("gui-progress-animated");
      } else {
        fill.classList.remove("gui-progress-animated");
      }
    }

    // ══ RADIO BUTTON GROUP ════════════════════════════════════════════════════

    createRadioGroup({ ID, X, Y, OPTS, LAYOUT }) {
      const id      = String(ID).trim();
      const wrapper = document.createElement("div");
      Object.assign(wrapper.style, {
        pointerEvents: "auto",
        display:       "flex",
        flexDirection: LAYOUT === "horizontal" ? "row" : "column",
        gap:           "8px",
        userSelect:    "none",
      });

      eventLatches[id] = false;
      const options = String(OPTS).split(",").map(o => o.trim()).filter(Boolean);
      options.forEach((opt, i) => {
        const row = document.createElement("label");
        Object.assign(row.style, {
          display:    "flex",
          alignItems: "center",
          gap:        "6px",
          cursor:     "pointer",
          fontFamily: "sans-serif",
          fontSize:   "14px",
          color:      "#000000",
        });
        const radio       = document.createElement("input");
        radio.type        = "radio";
        radio.name        = "gui-radio-" + id;
        radio.value       = opt;
        if (i === 0) radio.checked = true;
        radio.style.cursor      = "pointer";
        radio.style.accentColor = "#3A86FF";
        radio.addEventListener("change", () => {
          eventLatches[id] = true;
        }, { capture: true });
        const span       = document.createElement("span");
        span.textContent = opt;
        row.appendChild(radio);
        row.appendChild(span);
        wrapper.appendChild(row);
      });

      applyGeometry(wrapper, Number(X), Number(Y), 0, 0, String(ID).trim());
      registerWidget(id, wrapper);
    }

    getRadioValue({ ID }) {
      const el = getWidget(ID);
      if (!el) return "";
      const checked = el.querySelector("input[type=radio]:checked");
      return checked ? checked.value : "";
    }

    setRadioValue({ ID, VALUE }) {
      const el = getWidget(ID);
      if (!el) return;
      el.querySelectorAll("input[type=radio]").forEach(r => {
        r.checked = r.value === String(VALUE);
      });
    }

    radioChanged({ ID }) {
      const id = String(ID).trim();
      if (eventLatches[id]) { eventLatches[id] = false; return true; }
      return false;
    }

    // ══ TOAST / NOTIFICATION ══════════════════════════════════════════════════

    // Shared toast colours by type
    _toastColors(type) {
      return {
        info:    { bg: "#1E40AF", icon: "ℹ️" },
        success: { bg: "#15803D", icon: "✅" },
        warning: { bg: "#B45309", icon: "⚠️" },
        error:   { bg: "#B91C1C", icon: "❌" },
      }[type] || { bg: "#1E40AF", icon: "ℹ️" };
    }

    _buildToast(msg, type) {
      const { bg, icon } = this._toastColors(type);
      const toast = document.createElement("div");
      Object.assign(toast.style, {
        pointerEvents:  "auto",
        display:        "flex",
        alignItems:     "center",
        gap:            "8px",
        background:     bg,
        color:          "#FFFFFF",
        fontFamily:     "sans-serif",
        fontSize:       "14px",
        padding:        "10px 16px",
        borderRadius:   "8px",
        boxShadow:      "0 4px 12px rgba(0,0,0,0.3)",
        opacity:        "0",
        transition:     "opacity 0.3s ease, transform 0.3s ease",
        transform:      "translateY(8px)",
        maxWidth:       "300px",
        wordBreak:      "break-word",
      });
      const iconSpan = document.createElement("span");
      iconSpan.textContent = icon;
      iconSpan.dataset.toastIcon = "1";
      const msgSpan = document.createElement("span");
      msgSpan.textContent = String(msg);
      msgSpan.dataset.toastMsg = "1";
      toast.appendChild(iconSpan);
      toast.appendChild(msgSpan);

      // Ensure a toast stack container exists at bottom-right of overlay.
      let stack = getOverlay().querySelector("#gui-toast-stack");
      if (!stack) {
        stack = document.createElement("div");
        stack.id = "gui-toast-stack";
        Object.assign(stack.style, {
          position:      "absolute",
          bottom:        "16px",
          right:         "16px",
          display:       "flex",
          flexDirection: "column",
          gap:           "8px",
          pointerEvents: "none",
          zIndex:        "99999",
        });
        getOverlay().appendChild(stack);
      }
      stack.style.pointerEvents = "auto";
      stack.appendChild(toast);

      // Animate in
      requestAnimationFrame(() => {
        toast.style.opacity   = "1";
        toast.style.transform = "translateY(0)";
      });
      return toast;
    }

    showToast({ MSG, TYPE, SECS }) {
      const toast = this._buildToast(MSG, TYPE);
      const ms = Math.max(500, Number(SECS) * 1000);
      setTimeout(() => {
        toast.style.opacity   = "0";
        toast.style.transform = "translateY(8px)";
        setTimeout(() => toast.remove(), 350);
      }, ms);
    }

    showPersistentToast({ ID, MSG, TYPE }) {
      const existing = getWidget(ID);
      if (existing) existing.remove();
      const toast = this._buildToast(MSG, TYPE);
      // Register so it can be updated/dismissed by ID
      widgets[String(ID).trim()] = toast;
    }

    updateToastMessage({ ID, MSG }) {
      const toast = getWidget(ID);
      if (!toast) return;
      const msgSpan = toast.querySelector("[data-toast-msg]");
      if (msgSpan) msgSpan.textContent = String(MSG);
    }

    dismissToast({ ID }) {
      const toast = getWidget(ID);
      if (!toast) return;
      toast.style.opacity   = "0";
      toast.style.transform = "translateY(8px)";
      setTimeout(() => removeWidget(ID), 350);
    }

    // ══ MODAL / DIALOG ════════════════════════════════════════════════════════

    createModal({ ID, TITLE, MSG, W, H }) {
      const id = String(ID).trim();

      // ── Backdrop ──────────────────────────────────────────────────────────
      // Sits in document.body (outside the overlay's pointer-events cascade).
      // Positioned via JS to cover exactly the stage area, not the full page.
      const backdrop = document.createElement("div");
      backdrop.dataset.guiModal = id;
      Object.assign(backdrop.style, {
        position:       "fixed",
        background:     "rgba(0,0,0,0.45)",
        display:        "none",
        alignItems:     "center",
        justifyContent: "center",
        zIndex:         "999999",
        pointerEvents:  "auto",
      });

      // Position backdrop exactly over the stage canvas each time it is shown.
      const _snapToStage = () => {
        const stage =
          document.querySelector("canvas.sc-canvas") ||
          document.querySelector("[class*='stage_stage']") ||
          getOverlay();
        const r = stage.getBoundingClientRect();
        Object.assign(backdrop.style, {
          left:   r.left   + "px",
          top:    r.top    + "px",
          width:  r.width  + "px",
          height: r.height + "px",
        });
      };
      backdrop.dataset.snapFn = "1";   // marker so we can call _snapToStage later
      backdrop._snapToStage = _snapToStage;

      // ── Dialog box ────────────────────────────────────────────────────────
      const dialog = document.createElement("div");
      Object.assign(dialog.style, {
        background:    "#FFFFFF",
        borderRadius:  "12px",
        boxShadow:     "0 8px 32px rgba(0,0,0,0.3)",
        width:         Number(W) + "px",
        minHeight:     Number(H) + "px",
        display:       "flex",
        flexDirection: "column",
        overflow:      "hidden",
        fontFamily:    "sans-serif",
        pointerEvents: "auto",
        position:      "relative",  // so it is not stretched by the flex backdrop
        flexShrink:    "0",
      });

      // Title bar
      const titleBar = document.createElement("div");
      Object.assign(titleBar.style, {
        padding:      "14px 16px 10px",
        fontWeight:   "700",
        fontSize:     "16px",
        color:        "#0F172A",
        borderBottom: "1px solid #E2E8F0",
      });
      titleBar.dataset.modalTitle = "1";
      titleBar.textContent = String(TITLE);

      // Message
      const msgDiv = document.createElement("div");
      Object.assign(msgDiv.style, {
        padding:    "12px 16px",
        fontSize:   "14px",
        color:      "#334155",
        flex:       "1",
        lineHeight: "1.6",
      });
      msgDiv.dataset.modalMsg = "1";
      msgDiv.textContent = String(MSG);

      // Footer
      const footer = document.createElement("div");
      Object.assign(footer.style, {
        display:        "flex",
        justifyContent: "flex-end",
        gap:            "8px",
        padding:        "10px 16px",
        borderTop:      "1px solid #E2E8F0",
      });
      footer.dataset.modalFooter = "1";

      dialog.appendChild(titleBar);
      dialog.appendChild(msgDiv);
      dialog.appendChild(footer);
      backdrop.appendChild(dialog);
      document.body.appendChild(backdrop);
      widgets[id] = backdrop;
    }

    showModal({ ID }) {
      const el = getWidget(ID);
      if (!el) return;
      // Snap position to current stage bounds before making visible.
      if (el._snapToStage) el._snapToStage();
      el.style.display = "flex";
    }

    hideModal({ ID }) {
      const el = getWidget(ID);
      if (el) el.style.display = "none";
    }

    addModalButton({ BTN_ID, LABEL, COLOR, ID }) {
      const modal = getWidget(ID);
      if (!modal) return;
      const footer = modal.querySelector("[data-modal-footer]");
      if (!footer) return;

      const btnId = String(BTN_ID).trim();
      clickLatches[btnId] = false;
      clickCounts[btnId]  = 0;

      const btn = document.createElement("button");
      btn.textContent = String(LABEL);
      Object.assign(btn.style, {
        cursor:        "pointer",
        padding:       "6px 18px",
        border:        "none",
        borderRadius:  "6px",
        background:    parseColor(COLOR),
        color:         "#FFFFFF",
        fontFamily:    "sans-serif",
        fontSize:      "14px",
        fontWeight:    "600",
        transition:    "filter 0.15s",
        pointerEvents: "auto",
        userSelect:    "none",
      });

      btn.addEventListener("pointerenter", () => { btn.style.filter = "brightness(0.9)";  });
      btn.addEventListener("pointerleave", () => { btn.style.filter = ""; });
      btn.addEventListener("pointerdown",  (e) => {
        e.stopPropagation();
        btn.style.filter    = "brightness(0.8)";
        clickLatches[btnId] = true;
        clickCounts[btnId]++;
      });
      btn.addEventListener("pointerup", (e) => {
        e.stopPropagation();
        btn.style.filter = "";
      });
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        modal.style.display = "none"; // hides the modal immediately on click
      });

      footer.appendChild(btn);
      widgets[btnId] = btn;
    }

    setModalTitle({ ID, TITLE }) {
      const el = getWidget(ID);
      if (!el) return;
      const t = el.querySelector("[data-modal-title]");
      if (t) t.textContent = String(TITLE);
    }

    setModalMessage({ ID, MSG }) {
      const el = getWidget(ID);
      if (!el) return;
      const m = el.querySelector("[data-modal-msg]");
      if (m) m.textContent = String(MSG);
    }

    isModalVisible({ ID }) {
      const el = getWidget(ID);
      return el ? el.style.display === "flex" : false;
    }

    // ══ UNIVERSAL CONTROLS ════════════════════════════════════════════════════

    moveWidget({ ID, X, Y }) {
      const id = String(ID).trim();
      const el = getWidget(id);
      if (!el) return;
      const g  = geomRegistry[id] || { w: 0, h: 0, fontSize: 0 };

      if (childPanel[id]) {
        // Position is panel-relative: store as logical offset from panel center.
        const panelId = childPanel[id];
        const panelG  = geomRegistry[panelId];
        const panelLogicalX = panelG ? panelG.x : 0;
        const panelLogicalY = panelG ? panelG.y : 0;
        g.x = Number(X) - panelLogicalX;
        g.y = Number(Y) - panelLogicalY;
        geomRegistry[id] = g;
        _rescalePanelChildren(_scale());
        return;
      }

      // Normal widget or panel itself — absolute logical stage position.
      g.x = Number(X);
      g.y = Number(Y);
      geomRegistry[id] = g;
      _writeGeometryPx(el, g, _scale());

      // If this is a panel, its children's pixel positions also need
      // recomputing since they're relative to the panel's own box.
      if (panelChildren[id] !== undefined) {
        _rescalePanelChildren(_scale());
      }
    }

    shiftWidget({ ID, DX, DY }) {
      const id = String(ID).trim();
      const g  = geomRegistry[id];
      if (!g) return;
      this.moveWidget({ ID: id, X: g.x + Number(DX), Y: g.y + Number(DY) });
    }

    resizeWidget({ ID, W, H }) {
      const id = String(ID).trim();
      const el = getWidget(id);
      const g  = geomRegistry[id];
      if (!el || !g) return;
      g.w = Number(W);
      g.h = Number(H);
      geomRegistry[id] = g;
      if (childPanel[id]) {
        _rescalePanelChildren(_scale());
      } else {
        _writeGeometryPx(el, g, _scale());
        if (panelChildren[id] !== undefined) _rescalePanelChildren(_scale());
      }
    }

    getWidgetX({ ID }) {
      const id = String(ID).trim();
      const g  = geomRegistry[id];
      if (!g) return 0;
      if (childPanel[id]) {
        const panelG = geomRegistry[childPanel[id]];
        return (panelG ? panelG.x : 0) + g.x;
      }
      return g.x;
    }

    getWidgetY({ ID }) {
      const id = String(ID).trim();
      const g  = geomRegistry[id];
      if (!g) return 0;
      if (childPanel[id]) {
        const panelG = geomRegistry[childPanel[id]];
        return (panelG ? panelG.y : 0) + g.y;
      }
      return g.y;
    }

    setVisible({ ID, STATE }) {
      const el = getWidget(ID);
      if (el) el.style.display = STATE === "true" ? "" : "none";
    }

    isVisible({ ID }) {
      const el = getWidget(ID);
      return el ? el.style.display !== "none" : false;
    }

    setOpacity({ ID, OPACITY }) {
      const el = getWidget(ID);
      if (el) el.style.opacity = String(Math.max(0, Math.min(100, Number(OPACITY))) / 100);
    }

    setZIndex({ ID, Z }) {
      const el = getWidget(ID);
      if (el) el.style.zIndex = String(Math.round(Number(Z)));
    }

    bringToFront({ ID }) {
      const el = getWidget(ID);
      if (!el) return;
      const max = Object.values(widgets)
        .reduce((m, e) => Math.max(m, parseInt(e.style.zIndex || "0", 10)), 0);
      el.style.zIndex = String(max + 1);
    }

    sendToBack({ ID }) {
      const el = getWidget(ID);
      if (!el) return;
      const min = Object.values(widgets)
        .reduce((m, e) => Math.min(m, parseInt(e.style.zIndex || "0", 10)), 0);
      el.style.zIndex = String(min - 1);
    }

    deleteWidget({ ID }) {
      removeWidget(String(ID).trim());
    }

    deleteAllWidgets() {
      Object.keys(widgets).forEach(removeWidget);
    }
  }

  Scratch.extensions.register(new GUIComponentsExtension(Scratch.vm.runtime));
})();
