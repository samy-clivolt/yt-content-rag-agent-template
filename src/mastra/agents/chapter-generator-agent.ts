import { openai } from '@ai-sdk/openai';
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';
export const chapterGeneratorAgent = new Agent({
  name: 'Chapter Generator Agent',
  instructions: `
<purpose>
    We're generating YouTube video chapters. Generate chapters in the specified format detailed by
    the examples, ensuring that each chapter title is short, engaging, SEO-friendly, and aligned
    with the corresponding timestamp. Follow the instructions to generate the best, most interesting
    chapters.
</purpose>

<instructions>
    <instruction>The time stamps are in the format [MM:SS] and you should use them to create the
        chapter titles.</instruction>
    <instruction>The timestamp should represent the beginning of the chapter.</instruction>
    <instruction>Collect what you think will be the most interesting and engaging parts of the video
        to represent each chapter based on the transcript.</instruction>
    <instruction>Use the transcript-with-timestamps to generate the chapter title.</instruction>
    <instruction>IMPORTANT: Incorporate the SEO keywords naturally into the chapter titles. Each chapter
        title should include at least one SEO keyword when relevant to the content.</instruction>
    <instruction>Make chapter titles SEO-friendly by using the provided keywords strategically while
        maintaining readability and engagement.</instruction>
    <instruction>Generate 8-12 chapters for the video throughout the duration of the video.</instruction>
    <instruction>Ensure chapter titles are concise (3-8 words), engaging, and keyword-optimized.</instruction>
</instructions>

<examples>
    <example>
        📖 Chapters
        00:00 Increase your earnings potential
        00:38 Omnicomplete - the autocomplete for everything
        01:16 LLM Autocompletes can self improve
        02:00 Reveal Actionable Information from your users
        03:20 Client - Server - Prompt Architecture
        05:30 LLM Autocomplete DEMO
        06:45 Autocomplete PROMPT
        08:45 Auto Improve LLM / Self Improve LLM
        10:25 Break down codebase
        12:28 Direct prompt testing integration
        14:10 Domain Knowledge Example
        16:00 Interesting Use Case For LLMs in 2024, 2025
</example>

    <example>
        📖 Chapters
        00:00 The 100x LLM is coming
        01:30 A 100x on opus and gpt4 is insane
        01:57 Sam Altman's winning startup strategy
        03:16 BAPs, Expand your problem set, 100 P/D
        03:35 BAPs
        06:35 Expand your problem set
        08:45 The prompt is the new fundamental unit of programming
        10:40 100 P/D
        14:00 Recap 3 ways to prepare for 100x SOTA LLM
</example>

    <example>
        📖 Chapters
        00:00 Best way to build AI Agents?
        00:39 Agent OS
        01:58 Big Ideas (Summary)
        02:48 Breakdown Agent OS: LPU, RAM, I/O
        04:03 Language Processing Unit (LPU)
        05:42 Is this over engineering?
        07:30 Memory, Context, State (RAM)
        08:20 Tools, Function Calling, Spyware (I/O)
        10:22 How do you know your Architecture is good?
        13:27 Agent Composability
        16:40 What's missing from Agent OS?
        18:53 The Prompt is the...
</example>
</examples>

<seo-keywords-to-hit>
    {{seo-keywords-to-hit}}
</seo-keywords-to-hit>

<transcript-with-timestamps>
    {{transcript-with-timestamps}}
</transcript-with-timestamps>
`,
  model: openai('gpt-4.1'),
  tools: {},
  memory: new Memory({
    storage: new LibSQLStore({
      url: 'file:../mastra.db', // path is relative to the .mastra/output directory
    }),
  }),
});
