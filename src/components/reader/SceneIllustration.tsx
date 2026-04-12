"use client";

import { SCENE_DATA } from "@/data/sceneData";

interface SceneIllustrationProps {
  genre: string;
  pageIdx: number;
}

export function SceneIllustration({ genre, pageIdx }: SceneIllustrationProps) {
  const data = SCENE_DATA[genre] || SCENE_DATA.adventure;
  const bgIdx = pageIdx % data.bgs.length;
  const layerIdx = pageIdx % data.layers.length;
  return (
    <div className="scene" style={{ background: data.bgs[bgIdx] }}>
      {data.layers[layerIdx].map((el, i) => (
        <div
          key={i}
          className="scene-el"
          style={{
            left: `${el.x}%`,
            top: `${el.y}%`,
            fontSize: el.s || 24,
            transform: `translate(-50%,-50%)${el.r ? ` rotate(${el.r}deg)` : ""}`,
          }}
        >
          {el.e}
        </div>
      ))}
    </div>
  );
}
