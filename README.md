# Procedural MV

一个用于制作程序化音乐视频的 Codex skill。根据原始音频和歌词，使用 Canvas2D / WebGL 编写画面，并完成音频分析、歌词对齐、预览、检查与视频导出。

## 功能

- 提取音频特征、节拍、乐段和逐词时间；支持有歌词的歌曲及纯音乐。
- 提供平面动态排版、柔光、水墨纸张和音频可视化四种起始风格。
- 支持横屏 16:9、竖屏 9:16、方形 1:1、4:5 和自定义偶数尺寸，最高可导出 4K。
- 附带中文、韩文和拉丁文字体及对应的 SIL Open Font License 许可文件。
- 提供帧截图、联系表、画面检查和音频一致性验证。

完整工作流程见 [SKILL.md](SKILL.md)，音频处理依赖和故障排查见 [references/analysis.md](references/analysis.md)。

## 安装

将整个仓库克隆到 Codex 的 skills 目录，保持 `SKILL.md` 位于 `procedural-mv` 文件夹的根目录。

Windows PowerShell：

```powershell
git clone https://github.com/hansamar/procedural-mv.git "$HOME/.codex/skills/procedural-mv"
```

macOS / Linux：

```bash
git clone https://github.com/hansamar/procedural-mv.git ~/.codex/skills/procedural-mv
```

若使用自定义 `CODEX_HOME`，请改用该目录下的 `skills/procedural-mv`。目标目录已存在时，先检查已有内容，避免覆盖本地修改。

## 使用

在 Codex 中提供音频文件、歌词或 LRC，以及需要的风格和画面比例，例如：

```text
使用 $procedural-mv，把这首歌和歌词制作成 9:16 竖屏音乐视频。
先给我看风格方案和预览帧，确认后导出 1080p。
```

也可以用脚本创建独立项目。在本仓库根目录运行：

```bash
node scripts/new_project.mjs ../my-mv --audio /path/to/song.wav --lrc /path/to/song.lrc --format 9:16
cd ../my-mv
npm install
npx playwright install chromium
```

需要 Node.js、npm、Python 3.10+，以及 FFmpeg。FFmpeg 可通过 PATH、`FFMPEG_PATH` 或 Python 的 `imageio-ffmpeg` 包提供。Python 分析依赖按歌曲类型安装，详见 [分析说明](references/analysis.md)。首次使用部分语音模型时需要下载模型文件。

项目内的主要命令：

```bash
python analysis/run_all.py --lang zh
node scripts/serve.mjs
node scripts/check.mjs
node scripts/export.mjs --out exports/my-mv.mp4 --width 1080
```

分析完成后，还需要按 skill 流程完成概念设计、分镜、场景编写和预览确认。上述命令不是直接从音频生成成片的一键流程。无歌词和纯音乐的处理方式见分析说明。

## 文件结构

```text
SKILL.md               skill 入口与工作流程
scripts/new_project.mjs 独立项目创建脚本
references/            分析、视觉、渲染、导出和素材说明
assets/starter/        渲染引擎、分析脚本、场景模板和字体
```

## 音频与素材

导出流程会验证无损音频主文件的解码 PCM 一致性；用于交付的 MP4 使用 AAC 320k 音轨。输入歌曲和歌词由使用者提供。使用第三方素材时，按 [素材说明](references/assets-credits.md) 记录来源和许可，并取得所需授权。

随附字体的许可位于 [字体目录](assets/starter/assets/fonts/)。本仓库未另外指定代码许可证。
