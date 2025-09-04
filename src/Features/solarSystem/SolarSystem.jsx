import React, { useMemo, useState, useRef, useLayoutEffect, useCallback } from "react";

/**
 * SolarIsometricMapInteractive.jsx
 * - EN labels
 * - No central yellow glow
 * - Proportional sprite sizes (soft-compressed)
 * - Sun scales properly with zoom + dynamic cap vs Mercury orbit
 * - Starlink swarms anchored in WORLD space
 * - Hover FIX: zero-drift (translate by half, scale around center) + much smaller scale
 * - AU ring labels on the horizontal axis (right/left)
 */

export default function SolarIsometricMapInteractive({
                                                         githubUser = "tuo-utente",
                                                         projectMap = {},
                                                     }) {
    // ---------- Fullscreen ----------
    const rootRef = useRef(null);
    const [size, setSize] = useState({ w: 1280, h: 800 });
    useLayoutEffect(() => {
        const el = rootRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() =>
            setSize({ w: el.clientWidth, h: el.clientHeight })
        );
        ro.observe(el);
        setSize({ w: el.clientWidth, h: el.clientHeight });
        return () => ro.disconnect();
    }, []);
    const W = size.w,
        H = size.h;

    // ---------- World & projection ----------
    const MIN_AU = 0.3,
        MAX_AU = 200.0;
    const BASE_R_MIN = 120,
        BASE_R_MAX = 1200;
    const COS30 = Math.sqrt(3) / 2,
        SIN30 = 0.5;

    const rLog = (au) => {
        const f =
            (Math.log(au) - Math.log(MIN_AU)) /
            (Math.log(MAX_AU) - Math.log(MIN_AU));
        return BASE_R_MIN + f * (BASE_R_MAX - BASE_R_MIN);
    };
    const pol2 = (r, deg) => {
        const t = (deg * Math.PI) / 180;
        return [r * Math.cos(t), r * Math.sin(t)];
    };
    const isoRaw = (x, y, z = 0) => {
        const X = (x - y) * COS30;
        const Y = (x + y) * SIN30 - z;
        return [X, Y];
    };
    const isoRawInv = (X, Y) => {
        const x = (X / COS30 + Y / SIN30) / 2;
        const y = (Y / SIN30 - X / COS30) / 2;
        return [x, y];
    };

    // ---------- Camera ----------
    const fitInit = useCallback((w, h) => {
        const r = rLog(MAX_AU);
        const halfW = r * Math.SQRT2 * COS30;
        const halfH = r * Math.SQRT2 * SIN30;
        const margin = 32;
        const sFit = Math.min(
            (w - margin * 2) / (halfW * 2),
            (h - margin * 2) / (halfH * 2)
        );
        return {
            scale: sFit,
            tx: w / 2,
            ty: h / 2 + Math.min(160, h * 0.06),
            __lastFit: sFit,
        };
    }, []);
    const [cam, setCam] = useState(() => fitInit(W, H));

    useLayoutEffect(() => {
        setCam((old) => {
            const fit = fitInit(W, H);
            const zoomFactor = old.scale / (old.__lastFit || fit.scale);
            return {
                scale: fit.scale * zoomFactor,
                tx: fit.tx,
                ty: fit.ty,
                __lastFit: fit.scale,
            };
        });
    }, [W, H, fitInit]);

    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const MIN_SCALE = 0.05,
        MAX_SCALE = 60;

    const zoomAt = useCallback((focalXY, k) => {
        setCam((c) => {
            const { scale, tx, ty } = c;
            const newScale = clamp(scale * k, MIN_SCALE, MAX_SCALE);
            if (newScale === scale) return c;
            const xs = focalXY[0],
                ys = focalXY[1];
            const nx = xs - (xs - tx) * (newScale / scale);
            const ny = ys - (ys - ty) * (newScale / scale);
            return { ...c, scale: newScale, tx: nx, ty: ny };
        });
    }, []);

    // Pan/zoom handlers + clear tooltip if not hoverable
    const dragRef = useRef({ active: false, x: 0, y: 0, tx0: 0, ty0: 0 });
    const onSvgPointerDown = (e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        dragRef.current = {
            active: true,
            x: e.clientX,
            y: e.clientY,
            tx0: cam.tx,
            ty0: cam.ty,
        };
    };
    const onSvgPointerMove = (e) => {
        if (dragRef.current.active) {
            const dx = e.clientX - dragRef.current.x;
            const dy = e.clientY - dragRef.current.y;
            setCam((c) => ({
                ...c,
                tx: dragRef.current.tx0 + dx,
                ty: dragRef.current.ty0 + dy,
            }));
            return;
        }
        const t = e.target;
        if (!(t && typeof t.closest === "function" && t.closest('[data-hoverable="1"]'))) {
            setHover(null);
        }
    };
    const onSvgPointerUp = (e) => {
        if (!dragRef.current.active) return;
        dragRef.current.active = false;
        e.currentTarget.releasePointerCapture(e.pointerId);
    };
    const onSvgWheel = (e) => {
        e.preventDefault();
        const k = Math.pow(1.0018, -e.deltaY);
        zoomAt([e.clientX, e.clientY], k);
    };
    const pinch = useRef(null);
    const onSvgTouchStart = (e) => {
        if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            pinch.current = {
                d0: Math.hypot(dx, dy),
                cx: (e.touches[0].clientX + e.touches[1].clientX) / 2,
                cy: (e.touches[0].clientY + e.touches[1].clientY) / 2,
            };
        }
    };
    const onSvgTouchMove = (e) => {
        if (e.touches.length === 2 && pinch.current) {
            e.preventDefault();
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const d1 = Math.hypot(dx, dy);
            const k = clamp(d1 / pinch.current.d0, 0.5, 2);
            zoomAt([pinch.current.cx, pinch.current.cy], k);
        }
    };
    const onSvgTouchEnd = () => {
        pinch.current = null;
    };
    const onSvgPointerLeave = () => setHover(null);

    // Transform helpers
    const worldToScreen = (x, y, z = 0) => {
        const [Xi, Yi] = isoRaw(x, y, z);
        return [Xi * cam.scale + cam.tx, Yi * cam.scale + cam.ty];
    };
    const screenToWorld = (xs, ys) => {
        const Xi = (xs - cam.tx) / cam.scale;
        const Yi = (ys - cam.ty) / cam.scale;
        return isoRawInv(Xi, Yi);
    };

    // Secondary scales
    const sizeScale = Math.pow(cam.scale, 0.92); // planets/moons readability
    const strokeScale = Math.max(0.5, Math.pow(cam.scale, 0.8));
    const HOVER_SCALE = 1.002; // super tiny
    const HOVER_TRANSITION_MS = 70;

    // HUD adaptive
    const hudScale = clamp(Math.pow(cam.scale, 0.18), 0.9, 1.8);
    const hudFont = 14 * hudScale;
    const hudSmall = 12 * hudScale;

    // ---------- Real diameters (km) ----------
    const DIAM = {
        Sun: 1392700,
        Mercury: 4879,
        Venus: 12104,
        Earth: 12742,
        Mars: 6779,
        Ceres: 946,
        Jupiter: 139820,
        Saturn: 116460,
        Uranus: 50724,
        Neptune: 49244,
        Pluto: 2376,
        Moon: 3474,
        Phobos: 22.4,
        Deimos: 12.4,
        Io: 3643,
        Europa: 3122,
        Ganymede: 5268,
        Callisto: 4821,
        Titan: 5150,
        Enceladus: 504.2,
        Rhea: 1528,
        Dione: 1122.8,
        Titania: 1578,
        Oberon: 1523,
        Umbriel: 1169,
        Ariel: 1157,
        Miranda: 471.6,
        Triton: 2706,
        Charon: 1212,
    };

    // ---------- Scaling rules ----------
    const EARTH_BASE_PX = 34; // Earth reference at alpha=0.92 path (planets)
    const EXP_PLANET_MOON = 0.4; // softer compression for non-Sun
    const SUN_REL_EXP = 0.55; // Sun bigger than Earth (≈12–15×)
    const SUN_ZOOM_ALPHA = 1.0; // Sun follows zoom linearly
    const SUN_MIN_PX = 10; // allow it to shrink when zooming out
    const SUN_CAP_FRAC = 0.65; // Sun radius ≤ 65% of Mercury orbit radius

    // Size in base px (later * sizeScale inside HoverIcon)
    const sizeFromDiameter = (name) => {
        if (!DIAM[name]) return 24;
        const ratio = DIAM[name] / DIAM.Earth;
        const px = EARTH_BASE_PX * Math.pow(ratio, EXP_PLANET_MOON);
        return clamp(px, 12, 160);
    };

    // ---------- Data (EN) ----------
    const PLANETS = useMemo(
        () => [
            {
                name: "Mercury",
                kind: "circle",
                p: { a: 0.387 },
                sprite: "/sprites/mercury.png",
                size: sizeFromDiameter("Mercury"),
                ang: 15,
            },
            {
                name: "Venus",
                kind: "circle",
                p: { a: 0.723 },
                sprite: "/sprites/venus.png",
                size: sizeFromDiameter("Venus"),
                ang: 55,
            },
            {
                name: "Earth",
                kind: "circle",
                p: { a: 1.0 },
                sprite: "/sprites/earth.png",
                size: sizeFromDiameter("Earth"),
                ang: 25,
            },
            {
                name: "Mars",
                kind: "ellipse",
                p: { a: 1.524, e: 0.0934, omega: 286.5 },
                sprite: "/sprites/mars.png",
                size: sizeFromDiameter("Mars"),
                ang: 100,
            },
            {
                name: "Ceres",
                kind: "ellipse",
                p: { a: 2.77, e: 0.076, omega: 73.6 },
                sprite: "/sprites/ceres.png",
                size: sizeFromDiameter("Ceres"),
                ang: 140,
            },
            {
                name: "Jupiter",
                kind: "ellipse",
                p: { a: 5.204, e: 0.0489, omega: 14.7 },
                sprite: "/sprites/jupiter.png",
                size: sizeFromDiameter("Jupiter"),
                ang: 200,
            },
            {
                name: "Saturn",
                kind: "ellipse",
                p: { a: 9.58, e: 0.0565, omega: 92.4 },
                sprite: "/sprites/saturn.png",
                size: sizeFromDiameter("Saturn"),
                ang: 250,
            },
            {
                name: "Uranus",
                kind: "ellipse",
                p: { a: 19.2, e: 0.046, omega: 170.0 },
                sprite: "/sprites/uranus.png",
                size: sizeFromDiameter("Uranus"),
                ang: 305,
            },
            {
                name: "Neptune",
                kind: "ellipse",
                p: { a: 30.05, e: 0.009, omega: 46.3 },
                sprite: "/sprites/neptune.png",
                size: sizeFromDiameter("Neptune"),
                ang: 350,
            },
            {
                name: "Pluto",
                kind: "ellipse",
                p: { a: 39.48, e: 0.2488, omega: 113.8 },
                sprite: "/sprites/pluto.png",
                size: sizeFromDiameter("Pluto"),
                ang: 320,
            },
        ],
        []
    );

    // Note: dx/dy are WORLD offsets (local orbit radii estimation)
    const MOONS = useMemo(
        () => ({
            Earth: [
                {
                    name: "Moon",
                    sprite: "/sprites/moon.png",
                    size: sizeFromDiameter("Moon"),
                    dx: 60,
                    dy: -20,
                },
            ],
            Mars: [
                {
                    name: "Phobos",
                    sprite: "/sprites/phobos.png",
                    size: sizeFromDiameter("Phobos"),
                    dx: 40,
                    dy: -18,
                },
                {
                    name: "Deimos",
                    sprite: "/sprites/deimos.png",
                    size: sizeFromDiameter("Deimos"),
                    dx: 70,
                    dy: 12,
                },
            ],
            Jupiter: [
                {
                    name: "Io",
                    sprite: "/sprites/io.png",
                    size: sizeFromDiameter("Io"),
                    dx: 40,
                    dy: -22,
                },
                {
                    name: "Europa",
                    sprite: "/sprites/europa.png",
                    size: sizeFromDiameter("Europa"),
                    dx: 64,
                    dy: 0,
                },
                {
                    name: "Ganymede",
                    sprite: "/sprites/ganymede.png",
                    size: sizeFromDiameter("Ganymede"),
                    dx: 92,
                    dy: -18,
                },
                {
                    name: "Callisto",
                    sprite: "/sprites/callisto.png",
                    size: sizeFromDiameter("Callisto"),
                    dx: 124,
                    dy: 12,
                },
            ],
            Saturn: [
                {
                    name: "Titan",
                    sprite: "/sprites/titan.png",
                    size: sizeFromDiameter("Titan"),
                    dx: 76,
                    dy: -12,
                },
                {
                    name: "Enceladus",
                    sprite: "/sprites/enceladus.png",
                    size: sizeFromDiameter("Enceladus"),
                    dx: 40,
                    dy: 12,
                },
                {
                    name: "Rhea",
                    sprite: "/sprites/rhea.png",
                    size: sizeFromDiameter("Rhea"),
                    dx: 56,
                    dy: -24,
                },
                {
                    name: "Dione",
                    sprite: "/sprites/dione.png",
                    size: sizeFromDiameter("Dione"),
                    dx: 64,
                    dy: 10,
                },
            ],
            Uranus: [
                {
                    name: "Titania",
                    sprite: "/sprites/titania.png",
                    size: sizeFromDiameter("Titania"),
                    dx: 52,
                    dy: -16,
                },
                {
                    name: "Oberon",
                    sprite: "/sprites/oberon.png",
                    size: sizeFromDiameter("Oberon"),
                    dx: 72,
                    dy: 10,
                },
                {
                    name: "Umbriel",
                    sprite: "/sprites/umbriel.png",
                    size: sizeFromDiameter("Umbriel"),
                    dx: 40,
                    dy: 14,
                },
                {
                    name: "Ariel",
                    sprite: "/sprites/ariel.png",
                    size: sizeFromDiameter("Ariel"),
                    dx: 36,
                    dy: -12,
                },
                {
                    name: "Miranda",
                    sprite: "/sprites/miranda.png",
                    size: sizeFromDiameter("Miranda"),
                    dx: 28,
                    dy: 8,
                },
            ],
            Neptune: [
                {
                    name: "Triton",
                    sprite: "/sprites/triton.png",
                    size: sizeFromDiameter("Triton"),
                    dx: 54,
                    dy: -12,
                },
            ],
            Pluto: [
                {
                    name: "Charon",
                    sprite: "/sprites/charon.png",
                    size: sizeFromDiameter("Charon"),
                    dx: 44,
                    dy: -10,
                },
            ],
        }),
        []
    );

    const NEAR_ASSETS = useMemo(
        () => ({
            Earth: [
                {
                    name: "ISS",
                    sprite: "/sprites/iss.png",
                    size: 16,
                    dx: 22,
                    dy: 14,
                },
                {
                    name: "Hubble",
                    sprite: "/sprites/hubble.png",
                    size: 16,
                    dx: 36,
                    dy: -18,
                },
                { name: "GPS", sprite: "/sprites/gps.png", size: 14, dx: 52, dy: 18 },
            ],
            Jupiter: [
                {
                    name: "Juno",
                    sprite: "/sprites/juno.png",
                    size: 16,
                    dx: 90,
                    dy: 26,
                },
            ],
            Saturn: [
                {
                    name: "Cassini",
                    sprite: "/sprites/cassini.png",
                    size: 16,
                    dx: 96,
                    dy: 24,
                },
            ],
            Mars: [
                {
                    name: "Perseverance",
                    sprite: "/sprites/perseverance.png",
                    size: 16,
                    dx: 60,
                    dy: 26,
                },
                {
                    name: "Curiosity",
                    sprite: "/sprites/curiosity.png",
                    size: 16,
                    dx: 84,
                    dy: -18,
                },
            ],
        }),
        []
    );

    const ASTEROID_BELT = [2.1, 3.3];
    const KUIPER_BELT = [30.0, 50.0];

    const PROBES = useMemo(
        () => [
            {
                name: "New Horizons",
                theta: 25,
                r0: 35,
                sprite: "/sprites/new-horizons.png",
                size: 20,
                z: 24,
            },
            {
                name: "Pioneer 11",
                theta: 80,
                r0: 15,
                sprite: "/sprites/pioneer11.png",
                size: 20,
                z: 20,
            },
            {
                name: "Pioneer 10",
                theta: 140,
                r0: 20,
                sprite: "/sprites/pioneer10.png",
                size: 20,
                z: 20,
            },
            {
                name: "Voyager 2",
                theta: 215,
                r0: 30,
                sprite: "/sprites/voyager2.png",
                size: 20,
                z: 20,
            },
            {
                name: "Voyager 1",
                theta: 300,
                r0: 30,
                sprite: "/sprites/voyager1.png",
                size: 22,
                z: 24,
            },
        ],
        []
    );

    // ---------- Path helpers ----------
    const ellipseR = (a, e, nuDeg) => {
        const nu = (nuDeg * Math.PI) / 180;
        return (a * (1 - e * e)) / (1 + e * Math.cos(nu));
    };
    const pathCircle = (rWorld, steps = 240) => {
        const seg = [];
        for (let i = 0; i <= steps; i++) {
            const ang = (360 / steps) * i;
            const [x, y] = pol2(rWorld, ang);
            const [X, Y] = worldToScreen(x, y, 0);
            seg.push(`${i ? "L" : "M"} ${X.toFixed(1)} ${Y.toFixed(1)}`);
        }
        return seg.join(" ") + " Z";
    };
    const pathEllipse = (a_au, e, omegaDeg, steps = 360) => {
        const seg = [];
        for (let i = 0; i <= steps; i++) {
            const nu = (360 / steps) * i;
            const r_au = ellipseR(a_au, e, nu);
            const R = rLog(r_au);
            const [x, y] = pol2(R, nu + omegaDeg);
            const [X, Y] = worldToScreen(x, y, 0);
            seg.push(`${i ? "L" : "M"} ${X.toFixed(1)} ${Y.toFixed(1)}`);
        }
        return seg.join(" ") + " Z";
    };
    const pathLocalCircle = (cx, cy, r, steps = 180) => {
        const seg = [];
        for (let i = 0; i <= steps; i++) {
            const ang = (360 / steps) * i;
            const [x, y] = [
                cx + r * Math.cos((ang * Math.PI) / 180),
                cy + r * Math.sin((ang * Math.PI) / 180),
            ];
            const [X, Y] = worldToScreen(x, y, 0);
            seg.push(`${i ? "L" : "M"} ${X.toFixed(1)} ${Y.toFixed(1)}`);
        }
        return seg.join(" ") + " Z";
    };
    const pathRing = (auIn, auOut, steps = 240) => {
        const rIn = rLog(auIn),
            rOut = rLog(auOut);
        const outer = [],
            inner = [];
        for (let i = 0; i <= steps; i++)
            outer.push(worldToScreen(...pol2(rOut, (360 / steps) * i), 0));
        for (let i = steps; i >= 0; i--)
            inner.push(worldToScreen(...pol2(rIn, (360 / steps) * i), 0));
        const out =
            "M " +
            outer
                .map(([X, Y], i) => `${i ? "L" : ""} ${X.toFixed(1)} ${Y.toFixed(1)}`)
                .join(" ");
        const inn =
            " M " +
            inner
                .map(([X, Y], i) => `${i ? "L" : ""} ${X.toFixed(1)} ${Y.toFixed(1)}`)
                .join(" ") +
            " Z";
        return out + inn;
    };

    // ---------- Hover ----------
    const [hover, setHover] = useState(null);
    const handleEnter = useCallback((p) => setHover(p), []);
    const handleLeave = useCallback(() => setHover(null), []);

    // ---------- Utility ----------
    const makeId = (...parts) => parts.filter(Boolean).join("-");
    const toSlug = (s) =>
        (s || "")
            .toString()
            .trim()
            .toLowerCase()
            .replace(/[^\p{L}\p{N}]+/gu, "-")
            .replace(/^-+|-+$/g, "");
    const gh = (id, fallbackName) => {
        const meta = projectMap[id] || {};
        const slug = meta.slug || toSlug(fallbackName || id);
        const title = meta.title || fallbackName || id;
        return { url: `https://github.com/${githubUser}/${slug}`, title, slug };
    };

    // ---------- Hoverable icon (FIXED DRIFT) ----------
    const HoverIcon = ({
                           id,
                           objName,
                           projName,
                           x,
                           y,
                           size,
                           sprite,
                           linkUrl,
                           z = 0,
                       }) => {
        const [X, Y] = worldToScreen(x, y, z);
        const sPx = size * sizeScale; // base px -> screen px
        const half = sPx / 2;
        const hovered = hover && hover.id === id;
        const s = hovered ? HOVER_SCALE : 1;

        // IMPORTANT: keep translation independent of 's'
        const tx = X - half;
        const ty = Y - half;

        return (
            <a
                href={linkUrl}
                target="_blank"
                rel="noreferrer"
                onMouseEnter={() => handleEnter({ id, objName, projName, x: X, y: Y })}
                onMouseLeave={handleLeave}
                data-hoverable="1"
            >
                <g
                    data-hoverable="1"
                    style={{
                        cursor: "pointer",
                        transformOrigin: `${X}px ${Y}px`,
                        transform: `translate(${tx}px, ${ty}px) scale(${s})`,
                        transition: `transform ${HOVER_TRANSITION_MS}ms ease-out`,
                        willChange: "transform",
                    }}
                >
                    <image href={sprite} width={sPx} height={sPx} className="sprite" />
                </g>
            </a>
        );
    };

    // ---------- Fixed UI ----------
    const uiStop = (e) => {
        e.stopPropagation();
    };
    const zoomIn = () => zoomAt([W / 2, H / 2], 1.2);
    const zoomOut = () => zoomAt([W / 2, H / 2], 1 / 1.2);
    const resetView = () => setCam(fitInit(W, H));

    const { url: sunUrl, title: sunTitle } = gh("Sun", "Sun");

    // ---------- HUD labels ----------
    const hudLabels = [];
    const addHud = (text, x, y, kind = "label") =>
        hudLabels.push({ text, x, y, kind });

    // Earth (for Starlink)
    const earth = PLANETS.find((p) => p.name === "Earth");
    let earthWorld = [0, 0],
        earthSpritePx = 0,
        earthRWorld = 0,
        earthAng = 0;
    if (earth) {
        earthRWorld = rLog(earth.p.a);
        earthAng = earth.ang;
        const [xg, yg] = pol2(earthRWorld, earthAng);
        earthWorld = [xg, yg]; // WORLD coords of Earth
        earthSpritePx = earth.size * sizeScale; // Earth sprite size in SCREEN px
    }

    return (
        <div
            ref={rootRef}
            style={{ position: "fixed", inset: 0, background: "#0b1020", overflow: "hidden" }}
        >
            {/* Fixed UI */}
            <div
                className="ui"
                onPointerDown={uiStop}
                onPointerMove={uiStop}
                onWheel={uiStop}
                onTouchStart={uiStop}
                style={{
                    position: "fixed",
                    right: 12,
                    top: 12,
                    zIndex: 20,
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    userSelect: "none",
                }}
            >
                <button onClick={zoomOut} style={btnStyle}>
                    –
                </button>
                <button onClick={zoomIn} style={btnStyle}>
                    +
                </button>
                <button onClick={resetView} style={btnStyle}>
                    Reset
                </button>
                <span
                    style={{
                        color: "#cfe8ff",
                        fontFamily: uiFont,
                        fontSize: 12,
                        opacity: 0.8,
                    }}
                >
          scale {cam.scale.toFixed(2)}
        </span>
            </div>

            {/* Interactive SVG */}
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width={W}
                height={H}
                viewBox={`0 0 ${W} ${H}`}
                aria-label="Interactive Isometric Solar System"
                style={{ touchAction: "none" }}
                onPointerDown={onSvgPointerDown}
                onPointerMove={onSvgPointerMove}
                onPointerUp={onSvgPointerUp}
                onPointerLeave={onSvgPointerLeave}
                onWheel={onSvgWheel}
                onTouchStart={onSvgTouchStart}
                onTouchMove={onSvgTouchMove}
                onTouchEnd={onSvgTouchEnd}
            >
                {/* --- NO radial glow --- */}

                <style>{`
          .orbit       { stroke:#2b3a63; stroke-width:${(2*strokeScale).toFixed(2)}; fill:none; opacity:.6; }
          .moon-orbit  { stroke:#3d538a; stroke-width:${(1.2*strokeScale).toFixed(2)}; fill:none; opacity:.7; }
          .belt        { fill:#2b3a63; opacity:.25; fill-rule:evenodd; }
          .sprite      { image-rendering: pixelated; }
          .tooltip-bg  { fill:#152038; stroke:#2a3b66; rx:6; ry:6; opacity:.96 }
          .tooltip-text{ fill:#cfe8ff; font-size:${(14*Math.max(1, Math.pow(cam.scale,0.3))).toFixed(0)}px; font-family:${uiFont}; }
        `}</style>

                {/* Sun (proper zoom behaviour + correct cap) */}
                {(() => {
                    const [Xs, Ys] = worldToScreen(0, 0, 0);
                    const sunRatio = DIAM.Sun / DIAM.Earth; // ~109
                    const desiredScreenPx =
                        EARTH_BASE_PX *
                        Math.pow(sunRatio, SUN_REL_EXP) *
                        Math.pow(cam.scale, SUN_ZOOM_ALPHA);

                    const rMercuryScreen = rLog(0.387) * cam.scale;
                    const maxSunRadius = rMercuryScreen * SUN_CAP_FRAC;
                    const capWidth = 2 * maxSunRadius;

                    const sunPx = clamp(desiredScreenPx, SUN_MIN_PX, capWidth);

                    addHud("Sun", Xs, Ys - (sunPx / 2 + 10), "label");
                    return (
                        <g id="sun">
                            <a
                                href={sunUrl}
                                target="_blank"
                                rel="noreferrer"
                                onMouseEnter={() =>
                                    setHover({
                                        id: "Sun",
                                        objName: "Sun",
                                        projName: sunTitle,
                                        x: Xs,
                                        y: Ys,
                                    })
                                }
                                onMouseLeave={handleLeave}
                                data-hoverable="1"
                            >
                                <g
                                    data-hoverable="1"
                                    style={{
                                        cursor: "pointer",
                                        transformOrigin: `${Xs}px ${Ys}px`,
                                        transform: `translate(${Xs - sunPx / 2}px, ${Ys - sunPx / 2}px)`,
                                    }}
                                >
                                    <image href="/sprites/sun.png" width={sunPx} height={sunPx} className="sprite" />
                                </g>
                            </a>
                        </g>
                    );
                })()}

                {/* Belts */}
                <path className="belt" d={pathRing(ASTEROID_BELT[0], ASTEROID_BELT[1])} />
                <path className="belt" d={pathRing(KUIPER_BELT[0], KUIPER_BELT[1])} />

                {/* AU rings + labels (horizontal axis) */}
                {[0.5, 1, 2, 5, 10, 20, 30, 50, 100, 200].map((au) => {
                    const rW = rLog(au);
                    const d = pathCircle(rW, 200);

                    // offset radiale per tenere il testo appena fuori dall’anello
                    const labelOffsetWorld = 10;

                    // Due posizioni: destra (0°) e sinistra (180°).
                    // Se le vuoi solo a destra, usa const labelAngles = [0];
                    const labelAngles = [0, 180];

                    labelAngles.forEach((ang) => {
                        const [lxW, lyW] = pol2(rW + labelOffsetWorld, ang);
                        const [LX, LY] = worldToScreen(lxW, lyW, 0);
                        addHud(`${au} AU`, LX, LY, "au");
                    });

                    return (
                        <g key={`tick-${au}`}>
                            <path
                                className="orbit"
                                d={d}
                                strokeDasharray={`${(8 * strokeScale).toFixed(1)} ${(12 * strokeScale).toFixed(1)}`}
                            />
                        </g>
                    );
                })}

                {/* Planets + moon orbits + moons + assets */}
                {PLANETS.map((p) => {
                    const orbitPath =
                        p.kind === "circle"
                            ? pathCircle(rLog(p.p.a))
                            : pathEllipse(p.p.a, p.p.e, p.p.omega);

                    // planet position
                    let Rw;
                    if (p.kind === "circle") {
                        Rw = rLog(p.p.a);
                    } else {
                        const nu = p.ang - p.p.omega;
                        const r_au = ellipseR(p.p.a, p.p.e, nu);
                        Rw = rLog(r_au);
                    }
                    const [xg, yg] = pol2(Rw, p.ang);
                    const [LX, LY] = worldToScreen(...pol2(Rw + 28, p.ang), 0);

                    const planetId = p.name;
                    const { url: planetUrl, title: planetProj } = gh(planetId, p.name);

                    // HUD planet label
                    addHud(p.name, LX, LY - (p.size * sizeScale) / 2 - 8, "label");

                    // Moons: orbits + icons
                    const moons = MOONS[p.name] || [];
                    const moonRings = new Set();
                    const moonNodes = moons.map((m, i) => {
                        const rLocal = Math.hypot(m.dx || 0, m.dy || 0) || 40;
                        moonRings.add(Math.round(rLocal));
                        const phi = (360 / Math.max(1, moons.length)) * i;
                        const [mxOff, myOff] = pol2(rLocal, phi);
                        const [mxW, myW] = [xg + mxOff, yg + myOff];
                        const moonId = makeId(p.name, m.name);
                        const { url, title } = gh(moonId, m.name);
                        return (
                            <HoverIcon
                                key={`moon-${p.name}-${m.name}`}
                                id={moonId}
                                objName={m.name}
                                projName={title}
                                x={mxW}
                                y={myW}
                                size={m.size}
                                sprite={m.sprite}
                                linkUrl={url}
                            />
                        );
                    });

                    // Local assets
                    const assetNodes = (NEAR_ASSETS[p.name] || []).map((a) => {
                        const assetId = makeId(p.name, a.name);
                        const { url, title } = gh(assetId, a.name);
                        return (
                            <HoverIcon
                                key={`asset-${p.name}-${a.name}`}
                                id={assetId}
                                objName={a.name}
                                projName={title}
                                x={xg + a.dx}
                                y={yg + a.dy}
                                size={a.size}
                                sprite={a.sprite}
                                linkUrl={url}
                            />
                        );
                    });

                    return (
                        <g key={`planet-${p.name}`}>
                            {/* Planet orbit */}
                            <path className="orbit" d={orbitPath} />

                            {/* Moon orbits */}
                            {Array.from(moonRings).map((rRnd) => {
                                const rLocal = rRnd;
                                const dLocal = pathLocalCircle(xg, yg, rLocal, 160);
                                return (
                                    <path
                                        key={`moonring-${p.name}-${rRnd}`}
                                        className="moon-orbit"
                                        d={dLocal}
                                        strokeDasharray={`${(4 * strokeScale).toFixed(1)} ${(8 * strokeScale).toFixed(1)}`}
                                    />
                                );
                            })}

                            {/* Planet sprite */}
                            <HoverIcon
                                id={planetId}
                                objName={p.name}
                                projName={planetProj}
                                x={xg}
                                y={yg}
                                size={p.size}
                                sprite={p.sprite}
                                linkUrl={planetUrl}
                            />

                            {/* Moons + Assets */}
                            {moonNodes}
                            {assetNodes}
                        </g>
                    );
                })}

                {/* Starlink swarms around Earth — WORLD-ANCHORED */}
                {earth &&
                    (() => {
                        const [Xe, Ye] = worldToScreen(earthWorld[0], earthWorld[1], 0);

                        const earthSpriteRadiusPx = earthSpritePx / 2;
                        const marginPx = 12;

                        // convert distance to WORLD units
                        const ringWorld = (earthSpriteRadiusPx + marginPx) / cam.scale;
                        const ringPx = ringWorld * cam.scale;

                        const swarms = [
                            { key: "A", label: "Starlink A", centerAngle: 30, spacing: 6, count: 5 },
                            { key: "B", label: "Starlink B", centerAngle: 210, spacing: 6, count: 5 },
                        ];

                        return (
                            <g>
                                {swarms.map((sw, si) => {
                                    addHud(sw.label, Xe, Ye - (ringPx + 14 + si * 16), "label");

                                    return Array.from({ length: sw.count }).map((_, i) => {
                                        const angle = sw.centerAngle + (i - (sw.count - 1) / 2) * sw.spacing;
                                        const rad = (angle * Math.PI) / 180;

                                        const xw = earthWorld[0] + ringWorld * Math.cos(rad);
                                        const yw = earthWorld[1] + ringWorld * Math.sin(rad);

                                        const id = `starlink-${sw.key}-${String(i + 1).padStart(2, "0")}`;
                                        const { url, title } = gh(id, `Satellite ${i + 1}`);

                                        return (
                                            <HoverIcon
                                                key={id}
                                                id={id}
                                                objName={`Satellite ${i + 1}`}
                                                projName={title}
                                                x={xw}
                                                y={yw}
                                                size={14}
                                                sprite={"/sprites/starlink.png"}
                                                linkUrl={url}
                                            />
                                        );
                                    });
                                })}
                            </g>
                        );
                    })()}

                {/* Deep-space probes */}
                {PROBES.map((pb) => {
                    const r0 = rLog(pb.r0);
                    const [x0, y0] = pol2(r0, pb.theta);
                    const [x1, y1] = pol2(rLog(MAX_AU), pb.theta);
                    const [X0, Y0] = worldToScreen(x0, y0, 0);
                    const [X1, Y1] = worldToScreen(x1, y1, 0);
                    const id = pb.name.replace(/\s+/g, "-");
                    const { url, title } = gh(id, pb.name);
                    const [LsX, LsY] = worldToScreen(x0, y0, pb.z || 0);
                    addHud(pb.name, LsX, LsY - (pb.size * sizeScale) / 2 - 8, "label");
                    return (
                        <g key={`probe-${pb.name}`}>
                            <path
                                className="orbit"
                                d={`M ${X0} ${Y0} L ${X1} ${Y1}`}
                                strokeDasharray={`${(6 * strokeScale).toFixed(1)} ${(12 * strokeScale).toFixed(1)}`}
                            />
                            <HoverIcon
                                id={id}
                                objName={pb.name}
                                projName={title}
                                x={x0}
                                y={y0}
                                z={pb.z || 0}
                                size={pb.size}
                                sprite={pb.sprite}
                                linkUrl={url}
                            />
                        </g>
                    );
                })}

                {/* Tooltip */}
                {hover && <Tooltip x={hover.x} y={hover.y} obj={hover.objName} proj={hover.projName} />}
            </svg>

            {/* HUD overlay */}
            <div
                className="hud"
                style={{
                    position: "fixed",
                    inset: 0,
                    pointerEvents: "none",
                    zIndex: 15,
                    fontFamily: uiFont,
                }}
            >
                {hudLabels.map((l, i) => (
                    <div
                        key={i}
                        style={{
                            position: "absolute",
                            left: l.x,
                            top: l.y,
                            transform: "translate(-50%, -100%)",
                            color: "#cfe8ff",
                            fontSize: l.kind === "au" ? hudSmall : hudFont,
                            lineHeight: "16px",
                            textShadow: "0 0 2px rgba(0,0,0,0.6)",
                            whiteSpace: "nowrap",
                        }}
                    >
                        {l.text}
                    </div>
                ))}
            </div>
        </div>
    );
}

const uiFont =
    "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, 'Helvetica Neue', Arial";
const btnStyle = {
    background: "#1b2a4a",
    color: "#cfe8ff",
    border: "1px solid #2a3b66",
    borderRadius: 6,
    padding: "6px 10px",
    fontFamily: uiFont,
    cursor: "pointer",
};

/* ---------- Tooltip (SVG) ---------- */
function Tooltip({ x, y, obj, proj }) {
    const padX = 10,
        padY = 8,
        lineGap = 4;
    const charW = 7.2;
    const maxLen = Math.max((obj || "").length, (proj || "").length);
    const w = Math.max(160, padX * 2 + maxLen * charW);
    const h = padY * 2 + 14 + lineGap + 14;
    const ox = 16,
        oy = -28;
    return (
        <g transform={`translate(${x + ox}, ${y + oy})`} style={{ pointerEvents: "none" }}>
            <rect className="tooltip-bg" x="0" y="0" width={w} height={h} />
            <text className="tooltip-text" x={padX} y={padY + 12}>
                <tspan style={{ fontWeight: 700 }}>{obj}</tspan>
            </text>
            <text className="tooltip-text" x={padX} y={padY + 12 + lineGap + 14}>
                {proj}
            </text>
        </g>
    );
}
