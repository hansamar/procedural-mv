# Procedural MV

[English](README.md) | **简体中文**

一个面向 **Claude Code** 的音乐视频制作 skill。你提供音频和歌词，Claude 分析歌曲、提出视觉方案、编写场景、展示预览，并使用仓库附带的 Canvas2D / WebGL 工作流程导出确认后的成片。

适合歌词视频、动态文字排版、音频可视化、纯音乐，以及不同语言和曲风的音乐视频。每首歌单独设计视觉概念。场景以音频时间为依据，同一时间点可以重复渲染出相同画面。

## 功能

- **歌曲分析：**音频特征、节拍、乐段、人声起音和歌词对齐；缺少带时间歌词时可生成 LRC 草稿。
- **四种起始风格：**平面海报排版、柔光、水墨纸张和音频可视化，可通过编写场景进一步发展其他风格。
- **多种画面比例：**16:9、9:16、1:1、4:5 和自定义偶数尺寸，最高可导出 4K。
- **多语言文字：**附带中文、韩文和拉丁文字体，以及歌词排版工具。
- **预览与检查：**带声音的本地预览、帧截图、联系表和自动检查。
- **音频验证：**将无损中间主文件与源音频进行校验，再生成使用 AAC 音轨的 MP4 交付文件。

完整指令见 [SKILL.md](SKILL.md)。仓库包含 skill 使用的引擎、项目模板、分析脚本、字体和参考文档。

## 安装到 Claude Code

按需选择个人安装或项目安装。保留整个仓库的目录结构，支持文件需要与 `SKILL.md` 一起使用。

### 个人安装

安装后可在不同 Claude Code 项目中使用。

**macOS / Linux**

```bash
mkdir -p ~/.claude/skills
git clone https://github.com/hansamar/procedural-mv.git ~/.claude/skills/procedural-mv
```

**Windows PowerShell**

```powershell
New-Item -ItemType Directory -Force "$HOME/.claude/skills" | Out-Null
git clone https://github.com/hansamar/procedural-mv.git "$HOME/.claude/skills/procedural-mv"
```

### 项目安装

在项目根目录执行：

```bash
git clone https://github.com/hansamar/procedural-mv.git .claude/skills/procedural-mv
```

入口应位于 `.claude/skills/procedural-mv/SKILL.md`。通过 ZIP 安装时，将完整仓库解压到同一位置，避免额外嵌套一层文件夹。

在准备制作视频的项目中启动 Claude Code，输入 `/procedural-mv` 调用。安装路径和调用方式依据 [Claude Code 官方 skills 文档](https://code.claude.com/docs/en/skills)。

## 直接向 Claude 提问

提供本地音频路径、已有歌词或 LRC、画面比例和风格要求。为便于音频验证，建议使用 FLAC 或 WAV。包含空格的路径需要加引号。

**制作竖屏歌词视频**

```text
/procedural-mv
音频在 ./input/song.wav，带时间歌词在 ./input/song.lrc。
制作 9:16 竖屏歌词视频，使用柔光风格，保证歌词清晰。
先展示 2–3 种视觉方案和预览帧。
等我确认后，再导出 1080 × 1920 的成片。
```

**制作纯音乐可视化**

```text
/procedural-mv
使用 ./input/instrumental.flac 制作 16:9 音乐可视化视频。
根据乐段和重音安排画面，不需要歌词。
最终导出前，先展示联系表和预览。
```

**只有音频和普通歌词**

```text
/procedural-mv
音频在 ./input/song.wav，歌词在 ./input/lyrics.txt，歌曲语言为韩语。
先生成歌词时间草稿，标出需要核对的词句。
编写场景前，先提出视觉方案。
```

Claude 负责项目操作和场景代码。你负责选择视觉方向、核对不确定的歌词，并确认最终渲染。没有 LRC 时，语音识别会生成草稿，需要对照真实歌词检查。

## 运行条件

使用能够运行下列工具的本地 Claude Code 环境。本仓库尚未验证 Claude 网页聊天或其他托管环境中的执行情况。

| 组件 | 用途 |
| --- | --- |
| Git | 克隆和更新 skill；也可下载 ZIP 安装 |
| Node.js 与 npm | 项目准备、预览、检查和导出 |
| Playwright 与 Chromium | 浏览器渲染，在生成的项目中安装 |
| Python 3.10+ | 音频分析 |
| FFmpeg | 视频编码、音频封装及音频验证 |
| Python 分析依赖 | 按音频类型和已有歌词选择 |

音频特征和节拍分析使用 `numpy`、`scipy`、`librosa`、`soundfile`；人声分离和对齐使用 `torch`、`torchaudio`、`demucs`。未提供 LRC、需要生成带时间歌词草稿时，还需要 `openai-whisper`。完整依赖表、语言辅助包和故障处理见 [分析环境说明](references/analysis.md)。部分模型在首次使用时下载权重。GPU 可加速分析，CPU 也可运行。

脚本依次通过 `FFMPEG_PATH`、系统 PATH 或 Python 的 `imageio-ffmpeg` 包查找 FFmpeg。使用 Python 包回退查找时，可用 `PYTHON` 环境变量指定解释器。

## 制作流程

1. **输入与准备：**提供音频、歌词、比例和偏好，创建独立项目。
2. **分析：**提取时间和音乐特征，对齐歌词，核对识别草稿。
3. **概念设计：**选择视觉方案，检查代表性预览帧。
4. **场景制作：**围绕音乐编写画面变化、文字排版和转场。
5. **检查：**查看截图、联系表和实时预览，修复失败项并逐项查看警告。
6. **导出：**确认渲染后，获得 MP4 和适用的素材来源说明。

默认流程会等待你选择概念方案，并在最终导出前再次确认。完整步骤见 [SKILL.md](SKILL.md)，画面检查标准见 [视觉说明](references/visual-language.md)。

## 手动运行项目命令

Claude 可以代为执行这些命令。自行运行时，从已安装 skill 的根目录开始，将示例路径换成你的实际路径，并选择 skill 目录之外的空输出目录：

```bash
node scripts/new_project.mjs /path/to/my-mv --audio /path/to/song.wav --lrc /path/to/song.lrc --format 9:16
cd /path/to/my-mv
npm install
npx playwright install chromium
```

Windows 路径可写为 `C:/Videos/my-mv`。没有 LRC 时省略 `--lrc`。创建脚本会复制模板和输入文件，后续场景设计在新项目中完成。

在新项目中，按音频类型选择分析命令：

```bash
# 有人声的歌曲，按歌曲语言调整代码
python analysis/run_all.py --lang zh

# 纯音乐改用此命令
python analysis/run_all.py --instrumental
```

完成场景和时间安排后：

```bash
# 带声音的本地预览：http://localhost:5173
node scripts/serve.mjs

# 生成检查报告、截图和联系表
node scripts/check.mjs

# 按项目设定的尺寸导出已确认的视频
node scripts/export.mjs --out exports/my-mv.mp4
```

对于 9:16 项目，`--width 1080` 导出 1080 × 1920，`--width 2160` 导出 2160 × 3840；对于 16:9 项目，`--width 3840` 导出 3840 × 2160。片段、帧率、编码器和无损主文件参数见 [导出与验证](references/export-verify.md)。

## 输出与音频一致性

生成的项目保留可编辑场景代码、分析数据和导出文件。检查命令生成 `exports/check/report.json`、帧截图及 `exports/check/sheet.jpg`；导出命令将 MP4 写入 `--out` 指定的位置。

从零时刻开始且启用音频封装的导出，会使用 SHA-256 校验无损 ALAC 中间主文件与源音频解码后的 PCM 是否一致。校验成功时，摘要显示 `"audio_pcm_equal": true`。默认 MP4 使用 H.264 视频和 AAC 320k 音频。AAC 有损，因此一致性证明针对中间主文件。可通过 `--keep-master` 保留主文件。起点晚于零时刻的片段会跳过这项校验，详见 [验证说明](references/export-verify.md)。

## 仓库文件

| 路径 | 内容 |
| --- | --- |
| [SKILL.md](SKILL.md) | Claude 执行的 skill 指令 |
| [scripts/new_project.mjs](scripts/new_project.mjs) | 项目创建脚本 |
| [assets/starter/](assets/starter/) | 场景引擎、分析、渲染脚本和字体 |
| [references/styles.md](references/styles.md) | 模式、风格、曲风建议和比例 |
| [references/engine.md](references/engine.md) | 场景接口、排版、信号和字体 |
| [references/analysis.md](references/analysis.md) | 依赖、分析命令和故障处理 |
| [references/export-verify.md](references/export-verify.md) | 检查、导出和音频证明 |
| [references/assets-credits.md](references/assets-credits.md) | 素材来源、授权和署名 |

## 更新与常见问题

个人安装且没有本地修改时，可以执行：

```bash
git -C ~/.claude/skills/procedural-mv pull --ff-only
```

PowerShell 中使用 `git -C "$HOME/.claude/skills/procedural-mv" pull --ff-only`。项目安装则将路径替换为 `.claude/skills/procedural-mv`。更新前检查已有的本地修改。

- **无法调用 skill：**确认安装目录及 `SKILL.md` 入口位置，再在 Claude Code 中输入 `/procedural-mv`。避免同时安装同名个人版本和项目版本。
- **缺少 Python 依赖：**按照 `run_all.py` 的诊断，使用同一个解释器安装对应依赖，参见 [分析故障处理](references/analysis.md)。
- **歌词内容或时间不准：**修正 `data/song.lrc` 后重新分析；识别草稿需要在导出前核对。
- **出现 FAIL 或 WARN：**修复失败项，查看报告指向的画面，并解决或记录警告，参见 [检查报告说明](references/export-verify.md)。

## 素材与许可

当前 skill 使用代码绘制画面和记录过来源的借用素材，不使用 AI 生成的图片或视频。艺人照片、封面和官方影像需要在导出前逐项获得用户确认；这项确认不能替代权利人的授权。请提供有权使用的音频、歌词及其他素材，并按 [素材与署名说明](references/assets-credits.md) 记录来源。

随附字体的 SIL Open Font License 文本位于 [字体目录](assets/starter/assets/fonts/)。本仓库尚未单独指定代码许可证。
