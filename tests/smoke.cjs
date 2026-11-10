const { _electron } = require("@playwright/test");
const path = require("node:path");
(async () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({
    executablePath: process.env.MENGSHU_EXE,
    args: [
      ...(process.env.MENGSHU_EXE ? [] : [path.resolve("out/main/index.js")]),
      "--smoke",
    ],
    env,
    timeout: 30000,
  });
  let closed = false;
  app.on("close", () => (closed = true));
  app.process().stderr.on("data", (s) => process.stderr.write(s));
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    // The window spans the work area; previews show only the scene.
    const sceneClip = () =>
      page.evaluate(() => {
        const r = document.querySelector(".scene").getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      });
    await page.waitForSelector(".pet-speech");
    if ((await app.windows()).length !== 1)
      throw Error("Unexpected settings/taskbar window");
    const state = await page.evaluate(() => window.mengshu.snapshot());
    console.log("state", state);
    if (state.desktopError || state.inputError)
      throw Error("Native startup failed");
    const greeting = "酥饼好喵！我素薯薯养的键盘猫~";
    if (
      state.speech !== greeting ||
      (await page.locator(".pet-speech").textContent()) !== greeting
    )
      throw Error("Startup must show the exact welcome message");
    const greetingRemaining = state.speechUntil - Date.now();
    if (greetingRemaining < 8500 || greetingRemaining > 10000)
      throw Error("Startup welcome must use a ten-second timer");
    await page.evaluate(() => {
      window.mengshu.interact("pet");
      window.mengshu.interact("pet");
    });
    await page.waitForTimeout(100);
    const greetingAfterClicks = await page.evaluate(() =>
      window.mengshu.snapshot(),
    );
    if (
      greetingAfterClicks.speech !== greeting ||
      greetingAfterClicks.speechUntil !== state.speechUntil
    )
      throw Error(
        "Cat clicks must not replace or extend the ten-second welcome",
      );
    await page.screenshot({
      path: "docs/startup-preview.png",
      clip: await sceneClip(),
      omitBackground: true,
    });
    await page.waitForTimeout(
      Math.max(0, state.speechUntil - Date.now() - 250),
    );
    if ((await page.locator(".pet-speech").textContent()) !== greeting)
      throw Error("Startup welcome must remain visible until its timer ends");
    await page.waitForFunction(
      () => !document.querySelector(".pet-speech"),
      null,
      { timeout: 1500 },
    );
    // The desktop is click-through, so the sound must work without a user gesture.
    await page.evaluate(() => {
      window.__meowAudio = null;
      window.__meowCount = 0;
      window.__meowEvents = 0;
      window.mengshu.meow(() => {
        window.__meowEvents++;
      });
      const original = AudioContext.prototype.createBufferSource;
      AudioContext.prototype.createBufferSource = function (...args) {
        window.__meowAudio = this;
        window.__meowCount++;
        return original.apply(this, args);
      };
    });
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].webContents.send("meow"),
    );
    await page.waitForFunction(() => window.__meowAudio?.state === "running");
    if (!process.env.MENGSHU_EXE) {
      const { readdirSync } = require("node:fs");
      const { pathToFileURL } = require("node:url");
      const assets = path.resolve("out/renderer/assets");
      const urls = readdirSync(assets)
        .filter((name) => /^(meow|dog|other)-.*\.mp3$/.test(name))
        .map((name) => pathToFileURL(path.join(assets, name)).href);
      if (urls.length !== 40)
        throw Error("Build must include all 40 animal recordings");
      const durations = await page.evaluate(async (urls) => {
        const context = new AudioContext();
        try {
          return await Promise.all(
            urls.map(async (url) => {
              const response = await fetch(url);
              const buffer = await context.decodeAudioData(
                await response.arrayBuffer(),
              );
              if (
                !buffer
                  .getChannelData(0)
                  .some((sample) => Math.abs(sample) > 0.0001)
              )
                throw Error("Silent cat recording: " + url);
              return buffer.duration;
            }),
          );
        } finally {
          await context.close();
        }
      }, urls);
      if (durations.some((duration) => duration < 0.3 || duration > 4))
        throw Error("Animal recordings must be short and decodable");
      console.log(
        "decoded mixed animal clips",
        durations.length,
        "duration range",
        Math.min(...durations),
        Math.max(...durations),
      );
    }
    const bounds = await app.evaluate(({ BrowserWindow, screen }) => ({
      actual: BrowserWindow.getAllWindows()[0].getBounds(),
      primary: screen.getPrimaryDisplay().workArea,
    }));
    if (
      bounds.actual.x < bounds.primary.x ||
      Math.abs(
        bounds.actual.x +
          bounds.actual.width / 2 -
          (bounds.primary.x + bounds.primary.width / 2),
      ) > 1
    )
      throw Error("Primary display placement failed");
    if (!(await page.locator("img.keyboard-art").count()))
      throw Error("Generated keyboard missing");
    const paws = await page.locator("img.paw").evaluateAll((images) =>
      images.map((img) => ({
        src: img.src,
        ready: img.complete && img.naturalWidth > 100,
      })),
    );
    if (
      paws.length !== 2 ||
      !paws.every((p) => p.ready) ||
      paws[0].src === paws[1].src
    )
      throw Error("Two distinct photo paw cutouts must be loaded");
    if (await page.locator(".mouse, .mouse-art, .mouse-feedback").count())
      throw Error("Mouse visuals must be removed");
    if ((await page.locator(".key").allTextContents()).some((s) => s.trim()))
      throw Error("Keyboard must use image legends");
    const metricLabels = await page.locator(".metric > span").allTextContents();
    if (metricLabels.join(",") !== "敲薯,今日工作")
      throw Error("Statistics must only show 敲薯 and today's work");
    const workTime = await page
      .locator(".metric")
      .nth(1)
      .locator("strong")
      .textContent();
    if (!/^\d+ 时 \d+ 分$/.test(workTime))
      throw Error("Today's work must use hours and minutes");
    const send = async (type) =>
      app.evaluate(
        ({ BrowserWindow }, e) =>
          BrowserWindow.getAllWindows()[0].webContents.send("input", e),
        type,
      );
    const click = async (selector, fx = 0.5, fy = 0.5) => {
      const b = await page.locator(selector).boundingBox();
      if (!b) throw Error("Missing " + selector);
      await app.evaluate(
        ({ BrowserWindow }, p) =>
          BrowserWindow.getAllWindows()[0].webContents.send("desktop-click", p),
        { x: b.x + b.width * fx, y: b.y + b.height * fy },
      );
      await page.waitForTimeout(120);
    };
    await page.evaluate(() => window.mengshu.update({ paused: true }));
    await page.waitForTimeout(250);
    await page.screenshot({
      path: "docs/rest-pose-preview.png",
      clip: await sceneClip(),
      omitBackground: true,
    });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const idlePose = () =>
      page.locator(".cat, .paw").evaluateAll((images) =>
        images.map((img) => {
          const s = getComputedStyle(img);
          return {
            translate: s.translate,
            rotate: s.rotate,
            state: s.animationPlayState,
          };
        }),
      );
    const idleBefore = await idlePose();
    await page.waitForTimeout(750);
    const idleAfter = await idlePose();
    if (
      idleAfter.some(
        (pose, i) =>
          pose.state !== "running" ||
          (pose.translate === idleBefore[i].translate &&
            pose.rotate === idleBefore[i].rotate),
      )
    )
      throw Error("Cat and both paws must move gently while idle");
    const restLeft = await page
      .locator(".paw:not(.right)")
      .getAttribute("style");
    // Perspective is baked into the sprite, not a DOM transformation.
    if (
      await page
        .locator(".keyboard")
        .evaluate((el) => getComputedStyle(el).transform !== "none")
    )
      throw Error("Generated keyboard must not be CSS transformed");
    // Check reaches across measured image faces, including front corners.
    for (const [keycode, selector] of [
      [1, ".paw:not(.right)"],
      [29, ".paw:not(.right)"],
      [13, ".paw.right"],
      [83, ".paw.right"],
    ]) {
      await send({ type: "keydown", keycode });
      await page.waitForTimeout(180);
      const offset = await page.evaluate(
        ({ keycode, selector }) => {
          const scene = document
            .querySelector(".scene")
            .getBoundingClientRect();
          const key = document
            .querySelector(`[data-key="${keycode}"]`)
            .getBoundingClientRect();
          const paw = document.querySelector(selector);
          const scale = scene.width / 1440;
          return (
            Math.hypot(
              scene.left +
                parseFloat(paw.style.left) * scale -
                (key.x + key.width / 2),
              scene.top +
                parseFloat(paw.style.top) * scale -
                (key.y + key.height / 2),
            ) / scale
          );
        },
        { keycode, selector },
      );
      if (offset > 2)
        throw Error(`Paw misses projected key ${keycode}: ${offset}px`);
      await send({ type: "keyup", keycode });
    }
    const angles = [];
    for (const keycode of [30, 20]) {
      await send({ type: "keydown", keycode });
      await page.waitForTimeout(150);
      const pose = await page.locator(".paw:not(.right)").evaluate((img) => ({
        transform: img.style.transform,
        idleState: getComputedStyle(img).animationPlayState,
      }));
      angles.push(pose.transform.match(/rotate\(([-\d.]+)deg\)/)?.[1]);
      if (pose.idleState !== "paused")
        throw Error("Idle paw motion must pause while pressing");
      await send({ type: "keyup", keycode });
      await page.waitForTimeout(150);
    }
    if (!angles[0] || !angles[1] || angles[0] === angles[1])
      throw Error("Different key reaches must use different paw angles");
    if (
      (await page.locator(".paw:not(.right)").getAttribute("style")) !==
      restLeft
    )
      throw Error("Paw did not return to the resting R pose");
    await page.emulateMedia({ reducedMotion: "reduce" });
    if (
      await page
        .locator(".cat, .paw")
        .evaluateAll((images) =>
          images.some((img) => getComputedStyle(img).animationName !== "none"),
        )
    )
      throw Error("Reduced motion must disable idle animations");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.evaluate(() => window.dispatchEvent(new Event("reset-input")));
    const catRate = () =>
      page
        .locator(".cat")
        .evaluate((img) => img.getAnimations()[0]?.playbackRate);
    await send({ type: "keydown", keycode: 30 });
    for (let i = 0; i < 12; i++) await send({ type: "keydown", keycode: 30 });
    await page.waitForTimeout(650);
    const slowRate = await catRate();
    if (!(slowRate > 1 && slowRate < 1.6))
      throw Error("Holding a key must not inflate typing speed");
    await send({ type: "keyup", keycode: 30 });
    for (let i = 0; i < 12; i++) {
      await send({ type: "keydown", keycode: 30 });
      await send({ type: "keyup", keycode: 30 });
      await page.waitForTimeout(40);
    }
    await page.waitForTimeout(250);
    const fastRate = await catRate();
    if (!(fastRate > slowRate + 1))
      throw Error("Faster typing must speed up cat motion");
    const moveDuration = await page
      .locator(".paw")
      .first()
      .evaluate((img) => parseFloat(getComputedStyle(img).transitionDuration));
    if (!(moveDuration < 0.09))
      throw Error("Fast typing must make paw reaches quicker");
    await page.waitForTimeout(5000);
    if ((await catRate()) !== 1)
      throw Error("Cat must settle back to idle speed");
    console.log("motion tempo", { slowRate, fastRate, moveDuration });
    const beforeMove = await page.locator(".paw.right").getAttribute("style");
    await send({ type: "mousemove", x: 100, y: 100 });
    await send({ type: "wheel", x: 100, y: 100 });
    await page.waitForTimeout(300);
    if ((await page.locator(".paw.right").getAttribute("style")) !== beforeMove)
      throw Error("Movement moved paw");
    for (const button of [1, 2, 3]) {
      await send({ type: "mousedown", button });
      await page.waitForTimeout(300);
      if (
        (await page.locator(".paw.right").getAttribute("style")) !== beforeMove
      )
        throw Error("Mouse holds must not move paw");
      await send({ type: "mouseup", button });
    }
    await page.evaluate(() => window.mengshu.update({ paused: false }));
    await page.waitForTimeout(180);
    await page.screenshot({
      path: "docs/scene-preview.png",
      clip: await sceneClip(),
      omitBackground: true,
    });

    const keyCount = (await page.evaluate(() => window.mengshu.snapshot()))
      .daily.keys;
    const toggle = async (down) =>
      app.evaluate(
        (_, down) =>
          process
            .getBuiltinModule("module")
            .createRequire(process.cwd() + "/package.json")("uiohook-napi")
            .uIOhook.keyToggle(42, down),
        down,
      );
    await toggle("down");
    try {
      await page.waitForTimeout(150);
      if (!(await page.locator(".key.pressed").count()))
        throw Error("Native key animation missing");
      const pressedLook = await page
        .locator(".key.pressed")
        .first()
        .evaluate((el) => {
          const style = getComputedStyle(el);
          return style.backgroundColor + "|" + style.boxShadow;
        });
      if (pressedLook !== "rgba(0, 0, 0, 0)|none")
        throw Error("Pressed keys must not get a colour block: " + pressedLook);
      await page.screenshot({
        path: "docs/keypress-preview.png",
        clip: await sceneClip(),
        omitBackground: true,
      });
    } finally {
      await toggle("up");
    }
    await page.waitForTimeout(150);
    if (
      (await page.evaluate(() => window.mengshu.snapshot())).daily.keys <
      keyCount + 1
    )
      throw Error("Native key count missing");
    // The input process asks Windows for the real modifier state (koffi). A
    // key's own press is not "down" yet inside the hook, so press right Shift
    // while left Shift is held: that press must report Shift down.
    const toggleKey = (code, down) =>
      app.evaluate(
        (_, [code, down]) =>
          process
            .getBuiltinModule("module")
            .createRequire(process.cwd() + "/package.json")("uiohook-napi")
            .uIOhook.keyToggle(code, down),
        [code, down],
      );
    await page.evaluate(() => {
      window.__nativeKeys = [];
      window.__offNativeKeys = window.mengshu.input((e) =>
        window.__nativeKeys.push(e),
      );
    });
    await toggleKey(42, "down");
    try {
      await page.waitForTimeout(80);
      await toggleKey(54, "down");
      await page.waitForTimeout(80);
    } finally {
      await toggleKey(54, "up");
      await toggleKey(42, "up");
    }
    await page.waitForTimeout(150);
    const rightShift = await page.evaluate(() => {
      window.__offNativeKeys();
      return window.__nativeKeys.find(
        (e) => e.type === "keydown" && e.keycode === 54,
      );
    });
    if (!rightShift || !(rightShift.mods & 8))
      throw Error(
        "Native key presses must carry the real modifier state: " +
          JSON.stringify(rightShift),
      );
    const catClickWithRandom = async (roll) => {
      await app.evaluate((_, roll) => {
        globalThis.__originalRandom = Math.random;
        Math.random = () => roll;
      }, roll);
      try {
        await click(".cat", 0.3, 0.4);
      } finally {
        await app.evaluate(() => {
          Math.random = globalThis.__originalRandom;
        });
      }
    };
    const meowsBeforePet = await page.evaluate(() => window.__meowCount);
    const petClickStarted = Date.now();
    await catClickWithRandom(0.219999);
    if (!(await page.locator(".pet-speech").count()))
      throw Error("Pet dialogue missing");
    const speechState = await page.evaluate(() => window.mengshu.snapshot());
    if (
      speechState.speechUntil < petClickStarted + 3000 ||
      speechState.speechUntil > Date.now() + 3000
    )
      throw Error("Pet dialogue must expire in 3 seconds");
    await catClickWithRandom(0.22);
    const speechAfterClick = await page.evaluate(() =>
      window.mengshu.snapshot(),
    );
    if (
      speechAfterClick.speech !== speechState.speech ||
      speechAfterClick.speechUntil !== speechState.speechUntil
    )
      throw Error(
        "Clicks must not replace active dialogue or restart its timer",
      );
    await page.waitForFunction(
      (before) => window.__meowCount === before + 1,
      meowsBeforePet,
    );
    await page.waitForFunction(
      () => !document.querySelector(".pet-speech"),
      null,
      { timeout: 3500 },
    );
    if ((await page.evaluate(() => window.__meowCount)) !== meowsBeforePet + 1)
      throw Error("Cat clicks at or above the 22% threshold must stay silent");
    if (await page.locator(".pet-speech").count())
      throw Error("Repeated clicks must not prolong the three-second bubble");
    await catClickWithRandom(0.22);
    await page.waitForSelector(".pet-speech");
    const eventsBeforeBlockedClick = await page.evaluate(
      () => window.__meowEvents,
    );
    await catClickWithRandom(0);
    if (
      (await page.evaluate(() => window.__meowEvents)) !==
      eventsBeforeBlockedClick
    )
      throw Error("A blocked cat click must not roll or emit a meow");
    if (
      (await page.evaluate(() => window.mengshu.snapshot())).speechUntil <=
      speechState.speechUntil
    )
      throw Error("A fresh click after expiry must allow new dialogue");
    // Click bounce and rapid-click frenzy. Let the earlier clicks age out of
    // the frenzy window so this run starts from zero.
    await page.waitForTimeout(1700);
    const scriptedMotion = (selector) =>
      page.evaluate(
        (sel) =>
          document
            .querySelector(sel)
            .getAnimations()
            .filter(
              (a) => !(a instanceof CSSAnimation) && a.playState === "running",
            ).length,
        selector,
      );
    await click(".cat", 0.3, 0.4);
    if (!(await scriptedMotion(".cat")))
      throw Error("A cat click must bounce the cat");
    if (await page.locator(".scene.frenzy").count())
      throw Error("A single click must not start the frenzy");
    await page.waitForTimeout(1700);
    const homeCat = await page.locator(".cat").boundingBox();
    const homeWindow = await page.evaluate(() => [innerWidth, innerHeight]);
    const frenzyEvents = await page.evaluate(() => window.__meowEvents);
    // Every clip started from now on: which buffer, and whether it ended.
    await page.evaluate(() => {
      window.__clips = [];
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args) {
        const clip = { buffer: this.buffer, at: performance.now(), ended: 0 };
        window.__clips.push(clip);
        this.addEventListener("ended", () => (clip.ended = performance.now()));
        return start.apply(this, args);
      };
    });
    // Record the scene's on-screen scale every frame: any frame where it
    // changes is a visible flash while the window grows or shrinks.
    await page.evaluate(() => {
      const scene = document.querySelector(".scene");
      window.__sceneScales = [];
      window.__probe = true;
      const tick = () => {
        const r = scene.getBoundingClientRect();
        window.__sceneScales.push(Math.round(r.width));
        if (window.__probe) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    // Pinned roll: the first click is a plain pet and must not meow itself.
    for (let i = 0; i < 5; i++) await catClickWithRandom(0.5);
    await page.waitForSelector(".scene.frenzy", { timeout: 1000 });
    await page.waitForTimeout(500);
    for (const sel of [".cat", ".keyboard", ".paw", ".paw.right"])
      if (!(await scriptedMotion(sel)))
        throw Error(`The frenzy must send ${sel} running`);
    // The first of the five clicks opened a pet bubble; the frenzy closes it.
    const frenzyState = await page.evaluate(() => window.mengshu.snapshot());
    if (
      frenzyState.speech ||
      frenzyState.speechUntil ||
      (await page.locator(".pet-speech").count())
    )
      throw Error("The frenzy must close the speech bubble");
    if ((await page.evaluate(() => window.__meowEvents)) !== frenzyEvents + 1)
      throw Error("The frenzy must meow exactly once");
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: "docs/frenzy-preview.png",
      omitBackground: true,
    });
    await click(".cat", 0.3, 0.4);
    await page.evaluate(() => window.mengshu.interact("pet"));
    await page.waitForTimeout(150);
    if (
      (await page.evaluate(() => window.mengshu.snapshot())).speech ||
      (await page.locator(".pet-speech").count())
    )
      throw Error("No bubble may open during the frenzy");
    await page.waitForFunction(
      () => !document.querySelector(".scene.frenzy"),
      null,
      { timeout: 8000 },
    );
    // The window already covers the work area: a frenzy never resizes it.
    if (
      (await page.evaluate(() => [innerWidth, innerHeight])).join() !==
      homeWindow.join()
    )
      throw Error("A frenzy must not resize the window");
    await page.waitForTimeout(400);
    const scales = await page.evaluate(() => {
      window.__probe = false;
      return [...new Set(window.__sceneScales)];
    });
    if (scales.length !== 1)
      throw Error("The scene must never rescale during a frenzy: " + scales);
    for (const sel of [".cat", ".keyboard", ".paw", ".paw.right"])
      if (await scriptedMotion(sel))
        throw Error(`${sel} must be back home when the frenzy ends`);
    const backCat = await page.locator(".cat").boundingBox();
    if (
      Math.abs(backCat.x - homeCat.x) > 2 ||
      Math.abs(backCat.y - homeCat.y) > 6 ||
      Math.abs(backCat.width - homeCat.width) > 1
    )
      throw Error("The cat must land exactly where it started");
    // The cat yowls the whole frenzy, clip after clip, each one different,
    // and falls quiet when everything has landed.
    const yowls = await page.evaluate(() => {
      const clips = window.__clips;
      return {
        count: clips.length,
        distinct: new Set(clips.map((c) => c.buffer)).size,
        playing: clips.filter((c) => !c.ended).length,
        overlap: clips.some(
          (c, i) => i > 0 && clips[i - 1].ended > c.at + 1,
        ),
      };
    });
    console.log("frenzy yowls", yowls);
    if (yowls.count < 2 || yowls.distinct !== yowls.count)
      throw Error("A frenzy must keep yowling with different sounds");
    if (yowls.overlap) throw Error("Frenzy yowls must not overlap");
    if (yowls.playing) throw Error("Yowling must stop when the frenzy ends");
    await page.waitForTimeout(800);
    if ((await page.evaluate(() => window.__clips.length)) !== yowls.count)
      throw Error("No yowl may start after the frenzy ends");
    // A fresh key press bounces the cat with a 2.2% chance.
    const keyBounce = async (roll, keycode) => {
      await page.evaluate((roll) => {
        window.__random = Math.random;
        Math.random = () => roll;
      }, roll);
      try {
        await send({ type: "keydown", keycode });
        await page.waitForTimeout(40);
        return await scriptedMotion(".cat");
      } finally {
        await send({ type: "keyup", keycode });
        await page.evaluate(() => (Math.random = window.__random));
        await page.waitForTimeout(400);
      }
    };
    if (await keyBounce(0.022, 30))
      throw Error("Key presses at or above 2.2% must not bounce the cat");
    if (!(await keyBounce(0.0219, 31)))
      throw Error("Key presses below 2.2% must bounce the cat");
    if (await page.locator(".gear, .settings-menu").count())
      throw Error("Desktop gear and menu must be removed");
    await app.evaluate(({ Tray }) => {
      const original = Tray.prototype.setContextMenu;
      Tray.prototype.setContextMenu = function (menu) {
        globalThis.__tray = this;
        globalThis.__trayMenu = menu;
        return original.call(this, menu);
      };
    });
    const currentAutoStart = (
      await page.evaluate(() => window.mengshu.snapshot())
    ).settings.autoStart;
    await page.evaluate(
      (autoStart) => window.mengshu.update({ autoStart }),
      currentAutoStart,
    );
    const trayState = await app.evaluate(() => ({
      alive: !globalThis.__tray.isDestroyed(),
      bounds: globalThis.__tray.getBounds(),
      labels: globalThis.__trayMenu.items.map((item) => item.label),
    }));
    if (
      !trayState.alive ||
      trayState.bounds.width <= 0 ||
      trayState.labels.join(",") !== "开机自启,,退出"
    )
      throw Error("Native tray icon and settings menu must be available");
    const trayClick = (id) =>
      app.evaluate((_, id) => {
        const item = globalThis.__trayMenu.getMenuItemById(id);
        item.click(item, null, {});
      }, id);
    await catClickWithRandom(0.22);
    await page.waitForSelector(".pet-speech");
    const beforeDebug = await page.evaluate(() => window.mengshu.snapshot());
    const meowsBeforeReminder = await page.evaluate(() => window.__meowCount);
    await page.evaluate(() => window.mengshu.interact("debug-hour"));
    await page.waitForSelector(".rest-speech");
    const afterDebug = await page.evaluate(() => window.mengshu.snapshot());
    if (
      (await page.locator(".speech").count()) !== 1 ||
      afterDebug.speech ||
      afterDebug.speechUntil
    )
      throw Error("Rest reminder must replace and discard the previous speech");
    if (
      !afterDebug.reminderText ||
      (await page.locator(".rest-message").textContent()) !==
        afterDebug.reminderText ||
      (await page.locator(".rest-dismiss").textContent()) !== "我知道了"
    )
      throw Error(
        "Rest reminder must show selected text and acknowledgement button",
      );
    const reminderRemaining = afterDebug.reminderUntil - Date.now();
    if (reminderRemaining < 1799000 || reminderRemaining > 1800000)
      throw Error(
        "Debug hour must trigger the regular 30-minute rest reminder ",
      );
    if (
      afterDebug.daily.workMs - beforeDebug.daily.workMs > 5000 ||
      afterDebug.continuousMs - beforeDebug.continuousMs > 5000
    )
      throw Error("Debug hour must not inflate recorded work time");
    await page.waitForTimeout(1100);
    const eventsDuringReminder = await page.evaluate(() => window.__meowEvents);
    await catClickWithRandom(0);
    if (
      (await page.evaluate(() => window.__meowEvents)) !== eventsDuringReminder
    )
      throw Error("Clicking a cat during a reminder must not emit a meow");
    if (
      (await page.locator(".speech").count()) !== 1 ||
      (await page.locator(".rest-message").textContent()) !==
        afterDebug.reminderText ||
      (await page.evaluate(() => window.mengshu.snapshot())).speech
    )
      throw Error(
        "Pet speech must not interrupt or queue behind a rest reminder",
      );
    if ((await page.evaluate(() => window.__meowCount)) !== meowsBeforeReminder)
      throw Error("Rest reminder must stay silent until acknowledged");
    await page.screenshot({
      path: "docs/rest-reminder-preview.png",
      clip: await sceneClip(),
      omitBackground: true,
    });
    await click(".rest-message");
    if (!(await page.locator(".rest-speech").count()))
      throw Error("Reminder text must remain visible until acknowledged");
    await click(".rest-dismiss");
    if (await page.locator(".rest-speech").count())
      throw Error("Acknowledgement button must close the rest reminder");
    if (await page.locator(".speech").count())
      throw Error("Dismissal must not restore stale lower-priority speech");
    await page.waitForFunction(
      (before) => window.__meowCount === before + 1,
      meowsBeforeReminder,
    );
    await page.evaluate(() => window.mengshu.interact("dismiss"));
    await page.waitForTimeout(150);
    if (
      (await page.evaluate(() => window.__meowCount)) !==
      meowsBeforeReminder + 1
    )
      throw Error("Repeated acknowledgement must not play another meow");
    // Test-only preview actions cover panel looks without exposing tray debug controls.
    const panelShown = (id) =>
      page.waitForSelector(`.stats-display[data-panel="${id}"]`, {
        timeout: 2000,
      });
    const previewPanel = (action) =>
      page.evaluate((action) => window.mengshu.interact(action), action);
    if ((await page.locator('.stats-display[data-panel="normal"]').count()) !== 1)
      throw Error("Stats panel must start in its normal look");
    await previewPanel("debug-panel");
    await panelShown("fun-0");
    const panelState = await page.evaluate(() => window.mengshu.snapshot());
    const panelRemaining = panelState.panel.until - Date.now();
    if (panelRemaining < 595000 || panelRemaining > 600000)
      throw Error("A panel look must last ten minutes");
    if (panelState.reminderUntil)
      throw Error("A fun panel look must not raise the rest reminder");
    await previewPanel("debug-panel");
    await panelShown("fun-1");
    await previewPanel("debug-panel-off");
    await panelShown("normal");
    await previewPanel("debug-rest");
    await page.waitForSelector(".rest-speech");
    await panelShown("rest-0");
    await click(".rest-dismiss");
    await panelShown("normal");
    // Idle sway steps on one shared 100ms grid: the cat and both paws change
    // together about ten times a second, even after paws paused on keys.
    // Real typing on the test machine would speed the sway up: shut it out.
    await page.evaluate(() => window.mengshu.update({ paused: true }));
    await page.waitForFunction(
      () =>
        document
          .querySelector(".cat")
          .getAnimations()
          .every((a) => a.playbackRate === 1),
      null,
      { timeout: 8000 },
    );
    await page.waitForTimeout(400);
    const idleFrames = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const els = [...document.querySelectorAll(".cat, .paw")];
          const pose = () =>
            els
              .map((el) => {
                const s = getComputedStyle(el);
                return s.translate + "|" + s.rotate;
              })
              .join(";");
          let last = pose(),
            changed = 0,
            frames = 0;
          const t0 = performance.now();
          const frame = () => {
            frames++;
            const p = pose();
            if (p !== last) changed++;
            last = p;
            if (performance.now() - t0 < 2000) requestAnimationFrame(frame);
            else resolve({ changed, frames });
          };
          requestAnimationFrame(frame);
        }),
    );
    console.log("idle frames in 2s", idleFrames);
    if (!(idleFrames.changed >= 8 && idleFrames.changed <= 24))
      throw Error("Idle sway must step together about ten times a second");
    const panelSteps = () =>
      page.evaluate(
        () =>
          new Promise((resolve) => {
            const a = document
              .querySelector(".stats")
              .getAnimations({ subtree: true })[0];
            const seen = new Set();
            const t0 = performance.now();
            const frame = () => {
              seen.add(a.currentTime);
              if (performance.now() - t0 < 1000) requestAnimationFrame(frame);
              else resolve(seen.size);
            };
            requestAnimationFrame(frame);
          }),
      );
    const coveredChecks = async () => {
      const panelFps = await panelSteps();
      console.log("panel steps in 1s", panelFps);
      if (!(panelFps >= 12 && panelFps <= 24))
        throw Error("Panel looks must advance about twenty times a second");
      // Behind other windows nothing idles; only shortcut pops still answer.
      await previewPanel("debug-covered");
      await page.waitForSelector(".scene.covered");
      if ((await idlePose()).some((pose) => pose.state !== "paused"))
        throw Error("A covered scene must hold the idle sway");
      if ((await panelSteps()) !== 1)
        throw Error("A covered scene must freeze the panel look");
      const popsBefore = await page.locator(".key-pop").count();
      await send({ type: "keydown", keycode: 30, mods: 0 });
      await send({ type: "keyup", keycode: 30 });
      await page.waitForTimeout(100);
      if ((await page.locator(".key-pop").count()) !== popsBefore)
        throw Error("A covered scene must skip plain key pops");
      await send({ type: "keydown", keycode: 3675, mods: 4 });
      await send({ type: "keydown", keycode: 32, mods: 4 });
      await send({ type: "keyup", keycode: 32 });
      await send({ type: "keyup", keycode: 3675 });
      await page
        .waitForFunction(
          () =>
            [...document.querySelectorAll(".key-pop.shortcut")].some(
              (el) => el.textContent === "回桌面看懵薯！",
            ),
          null,
          { timeout: 1000, polling: 16 },
        )
        .catch(() => {
          throw Error("Win+D must still answer while covered");
        });
      await previewPanel("debug-uncovered");
      await page.waitForFunction(
        () => !document.querySelector(".scene.covered"),
      );
      if ((await idlePose()).some((pose) => pose.state !== "running"))
        throw Error("An uncovered scene must resume the idle sway");
      if ((await panelSteps()) < 12)
        throw Error("An uncovered scene must resume the panel look");
      // Alt held past the stale-key sweep: Windows still reports it down.
      await send({ type: "keydown", keycode: 15, mods: 2 });
      await send({ type: "keyup", keycode: 15 });
      await page.waitForTimeout(80);
      const altTab = await page.locator(".key-pop").last().textContent();
      if (!["切换！", "溜号~", "换个窗口"].includes(altTab))
        throw Error("Alt+Tab must follow the real Alt state: " + altTab);
    };
    // Every panel look runs on the 20fps clock (script-paused animations).
    // Thirty of each keeps the preview order where PANEL_SHOTS expects it.
    for (let i = 0; i < 60; i++) {
      await previewPanel(i < 30 ? "debug-panel" : "debug-rest");
      await page.waitForTimeout(120);
      const states = await page.evaluate(() =>
        document
          .querySelector(".stats")
          .getAnimations({ subtree: true })
          .map((a) => a.playState),
      );
      if (states.some((state) => state !== "paused"))
        throw Error(
          "Panel look must use the 20fps clock: " +
            (await page.locator(".stats-display").getAttribute("data-panel")),
        );
      if (i === 0) {
        await panelShown("fun-2");
        await coveredChecks();
      }
    }
    await page.evaluate(() => window.mengshu.interact("dismiss"));
    await page.evaluate(() => window.mengshu.update({ paused: false }));
    await previewPanel("debug-panel-off");
    await panelShown("normal");
    if (process.env.PANEL_SHOTS) {
      const fs = require("node:fs");
      fs.mkdirSync(process.env.PANEL_SHOTS, { recursive: true });
      const statsClip = () =>
        page.evaluate(() => {
          const r = document.querySelector(".stats").getBoundingClientRect();
          return { x: r.x - 6, y: r.y - 6, width: r.width + 12, height: r.height + 12 };
        });
      console.log(
        "panel-normal",
        await page.evaluate(() => {
          const el = document.querySelector(".stats-display");
          return [el.offsetHeight, ...[...el.querySelectorAll(".metric")].map((m) => m.getBoundingClientRect().height)].join(" ");
        }),
      );
      for (const mode of ["fun", "rest"])
        for (let i = mode === "fun" ? 2 : 1; i <= 30; i++) {
          const want = `${mode}-${i % 30}`;
          await previewPanel(mode === "fun" ? "debug-panel" : "debug-rest");
          await panelShown(want);
          await page.waitForTimeout(700);
          const [running, height] = await page.evaluate(() => {
            const el = document.querySelector(".stats-display");
            return [el.getAnimations({ subtree: true }).length, el.offsetHeight];
          });
          console.log("panel-anim", want, running, height);
          await page.screenshot({
            path: path.join(process.env.PANEL_SHOTS, `${want}.png`),
            clip: await statsClip(),
          });
        }
      await page.evaluate(() => window.mengshu.interact("dismiss"));
      await previewPanel("debug-panel-off");
    }
    const original = (await page.evaluate(() => window.mengshu.snapshot()))
      .settings.autoStart;
    for (const expected of [!original, original]) {
      await trayClick("autostart");
      if (
        (await page.evaluate(() => window.mengshu.snapshot())).settings
          .autoStart !== expected
      )
        throw Error("Tray autostart action must update settings");
      if (
        (await app.evaluate(
          () => globalThis.__trayMenu.getMenuItemById("autostart").checked,
        )) !== expected
      )
        throw Error("Tray checkbox must track the current autostart setting");
    }
    // 打字时键盘印字不能闪：远离按键的数字小键盘区域，空闲与按键时像素一致。
    await page.waitForTimeout(1200);
    const numpad = await page.evaluate(() => {
      const r = (c) =>
        document.querySelector(`[data-key="${c}"]`).getBoundingClientRect();
      const a = r(69),
        b = r(83);
      return {
        x: Math.round(a.left),
        y: Math.round(a.top),
        width: Math.round(b.right - a.left),
        height: Math.round(b.bottom - a.top),
      };
    });
    const legendDiff = (first) =>
      app.evaluate(
        async ({ BrowserWindow }, { rect, first }) => {
          const image =
            await BrowserWindow.getAllWindows()[0].webContents.capturePage(
              rect,
            );
          const bitmap = image.toBitmap();
          if (first) {
            globalThis.__legendIdle = bitmap;
            return 0;
          }
          const idle = globalThis.__legendIdle;
          let changed = 0;
          for (let i = 0; i < bitmap.length; i++)
            if (Math.abs(bitmap[i] - idle[i]) > 24) changed++;
          return changed;
        },
        { rect: numpad, first },
      );
    await legendDiff(true);
    let worstLegendDiff = 0;
    for (const keycode of [30, 31, 32, 33, 16, 17]) {
      await send({ type: "keydown", keycode });
      await page.waitForTimeout(40);
      worstLegendDiff = Math.max(worstLegendDiff, await legendDiff(false));
      await send({ type: "keyup", keycode });
      await page.waitForTimeout(40);
    }
    if (worstLegendDiff > 0)
      throw Error(
        `Keyboard legends must not shimmer while typing (${worstLegendDiff} channels changed)`,
      );
    // 键帽飘字：固定开启，只出文字不出声，不显示真实按键，暗号回应。
    const meowsBeforePops = await page.evaluate(() => window.__meowCount);
    for (const keycode of [30, 31, 32, 50, 24, 21, 22]) {
      await send({ type: "keydown", keycode });
      await send({ type: "keyup", keycode });
      await page.waitForTimeout(50);
    }
    await page.waitForSelector(".key-pop.word");
    const pops = await page.locator(".key-pop").allTextContents();
    if (pops.some((text) => /^[ASDMOYU]$/i.test(text.trim())))
      throw Error("Key pops must never reveal the real typed key");
    await page.screenshot({
      path: "docs/key-pops-preview.png",
      clip: await sceneClip(),
      omitBackground: true,
    });
    if ((await page.evaluate(() => window.__meowCount)) !== meowsBeforePops)
      throw Error("Key pops must not add any sound");
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].destroy(),
    );
    await new Promise((r) => setTimeout(r, 4000));
    if ((await app.windows()).length !== 1)
      throw Error("Desktop recovery failed");
    const recovered = (await app.windows())[0];
    await recovered.waitForLoadState("domcontentloaded");
    if (await recovered.locator(".pet-speech").count())
      throw Error("Desktop recovery must not repeat the startup welcome");
    if (await recovered.locator(".gear").count())
      throw Error("Recovery must not restore the gear");
    if (await app.evaluate(() => globalThis.__tray.isDestroyed()))
      throw Error("Tray must survive desktop recovery");
    const exit = app.waitForEvent("close");
    await trayClick("quit");
    await exit;
    console.log(
      "smoke passed: steady key legends, key pops, idle motion, key-dependent rotation, reduced motion, native input, native tray routing, debug rest reminder, persisted toggle, recovery, quit",
    );
  } finally {
    if (!closed) await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
