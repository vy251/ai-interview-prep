const { GoogleGenAI, Type } = require("@google/genai");
const { z } = require("zod");
const { zodToJsonSchema } = require("zod-to-json-schema");
const puppeteer = require("puppeteer");

const ai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_GENAI_API_KEY,
});

// ---- Zod schema: used to VALIDATE the AI's response, not to build the Gemini schema ----
const interviewReportSchema = z.object({
  matchScore: z.number(),
  technicalQuestions: z.array(
    z.object({
      question: z.string(),
      intention: z.string(),
      answer: z.string(),
    }),
  ),
  behavioralQuestions: z.array(
    z.object({
      question: z.string(),
      intention: z.string(),
      answer: z.string(),
    }),
  ),
  skillGaps: z.array(
    z.object({
      skill: z.string(),
      severity: z.enum(["low", "medium", "high"]),
    }),
  ),
  preparationPlan: z.array(
    z.object({
      day: z.number(),
      focus: z.string(),
      tasks: z.array(z.string()),
    }),
  ),
  title: z.string(),
});

// ---- Gemini native schema: hand-written, no lossy conversion, no $ref issues ----
const geminiResponseSchema = {
  type: Type.OBJECT,
  properties: {
    matchScore: {
      type: Type.NUMBER,
      description:
        "A score between 0 and 100 indicating how well the candidate's profile matches the job description",
    },
    technicalQuestions: {
      type: Type.ARRAY,
      description:
        "Technical questions that can be asked in the interview along with their intention and how to answer them",
      items: {
        type: Type.OBJECT,
        properties: {
          question: {
            type: Type.STRING,
            description: "The technical question that can be asked in the interview",
          },
          intention: {
            type: Type.STRING,
            description: "The intention of the interviewer behind asking this question",
          },
          answer: {
            type: Type.STRING,
            description:
              "How to answer this question, what points to cover, what approach to take etc.",
          },
        },
        required: ["question", "intention", "answer"],
      },
    },
    behavioralQuestions: {
      type: Type.ARRAY,
      description:
        "Behavioral questions that can be asked in the interview along with their intention and how to answer them",
      items: {
        type: Type.OBJECT,
        properties: {
          question: {
            type: Type.STRING,
            description: "The behavioral question that can be asked in the interview",
          },
          intention: {
            type: Type.STRING,
            description: "The intention of the interviewer behind asking this question",
          },
          answer: {
            type: Type.STRING,
            description:
              "How to answer this question, what points to cover, what approach to take etc.",
          },
        },
        required: ["question", "intention", "answer"],
      },
    },
    skillGaps: {
      type: Type.ARRAY,
      description:
        "List of skill gaps in the candidate's profile along with their severity",
      items: {
        type: Type.OBJECT,
        properties: {
          skill: {
            type: Type.STRING,
            description: "The skill which the candidate is lacking",
          },
          severity: {
            type: Type.STRING,
            enum: ["low", "medium", "high"],
            description: "The severity of this skill gap",
          },
        },
        required: ["skill", "severity"],
      },
    },
    preparationPlan: {
      type: Type.ARRAY,
      description:
        "A day-wise preparation plan for the candidate to follow in order to prepare for the interview effectively",
      items: {
        type: Type.OBJECT,
        properties: {
          day: {
            type: Type.NUMBER,
            description: "The day number in the preparation plan, starting from 1",
          },
          focus: {
            type: Type.STRING,
            description:
              "The main focus of this day, e.g. data structures, system design, mock interviews etc.",
          },
          tasks: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "List of tasks to be done on this day",
          },
        },
        required: ["day", "focus", "tasks"],
      },
    },
    title: {
      type: Type.STRING,
      description: "The title of the job for which the interview report is generated",
    },
  },
  required: [
    "matchScore",
    "technicalQuestions",
    "behavioralQuestions",
    "skillGaps",
    "preparationPlan",
    "title",
  ],
};

// ---- Defensive normalizer: Gemini structured output is unreliable for
// nested arrays-of-objects, even with responseSchema set. We've observed
// three failure modes in practice:
//   1. Correct: array of proper objects
//   2. Objects returned as backtick-wrapped JSON strings
//   3. Fields flattened into a single alternating key/value array, e.g.
//      ["question", "...", "intention", "...", "answer", "...", "question", ...]
// reconstructObjectArray() detects and repairs all three.

function safeParseMaybeString(value) {
  if (typeof value !== "string") return value;
  const cleaned = value
    .trim()
    .replace(/^```json/i, "")
    .replace(/^```/, "")
    .replace(/```$/, "")
    .replace(/^`+|`+$/g, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    return value;
  }
}

// Groups a flat ["key", value, "key", value, ...] array into objects.
// expectedKeys defines both the field order and how many key/value pairs
// make up one record.
function unflattenKeyValueArray(arr, expectedKeys) {
  const objs = [];
  let i = 0;
  while (i < arr.length) {
    const obj = {};
    for (let j = 0; j < expectedKeys.length && i < arr.length; j++) {
      const key = arr[i];
      const value = arr[i + 1];
      obj[key] = value;
      i += 2;
    }
    if (Object.keys(obj).length > 0) objs.push(obj);
  }
  return objs;
}

function reconstructObjectArray(value, expectedKeys) {
  const top = safeParseMaybeString(value);
  if (!Array.isArray(top) || top.length === 0) return [];

  const first = top[0];

  // Mode 3: flattened key/value sequence, e.g. arr[0] === "question"
  if (typeof first === "string" && expectedKeys.includes(first)) {
    return unflattenKeyValueArray(top, expectedKeys);
  }

  // Mode 2 / Mode 1: array of (possibly stringified) objects
  return top.map((item) => {
    const parsedItem = safeParseMaybeString(item);
    return parsedItem;
  });
}

function normalizeSkillGaps(value) {
  return reconstructObjectArray(value, ["skill", "severity"]).map((item) => {
    if (item && typeof item === "object" && typeof item.severity === "string") {
      return { ...item, severity: item.severity.toLowerCase() };
    }
    return item;
  });
}

function normalizeQAField(value) {
  return reconstructObjectArray(value, ["question", "intention", "answer"]);
}

function normalizePreparationPlan(value) {
  return reconstructObjectArray(value, ["day", "focus", "tasks"]).map((item) => {
    if (item && typeof item === "object" && typeof item.tasks === "string") {
      // tasks should be an array of strings; wrap a lone string
      return { ...item, tasks: [item.tasks] };
    }
    return item;
  });
}

const MAX_ATTEMPTS = 3; // 1 initial try + 2 retries

function buildPrompt({ resume, selfDescription, jobDescription, previousError }) {
  const retryNote = previousError
    ? `
IMPORTANT: Your previous response was INVALID and failed validation with this
error:
"${previousError}"
Fix this in your next response. Follow the format rules below exactly.
`
    : "";

  return `
Generate an interview report for this candidate.

Resume:
${resume}

Self Description:
${selfDescription}

Job Description:
${jobDescription}
${retryNote}
Return ONLY the following top-level fields — no others:
- matchScore (number)
- technicalQuestions (array)
- behavioralQuestions (array)
- skillGaps (array)
- preparationPlan (array)
- title (string)

CRITICAL FORMAT RULES:
- technicalQuestions and behavioralQuestions: array of OBJECTS. Each object
  MUST look exactly like this shape (a single JSON object per array element,
  NOT separate key/value entries):
  { "question": "...", "intention": "...", "answer": "..." }
- skillGaps: array of OBJECTS shaped exactly like:
  { "skill": "...", "severity": "low" | "medium" | "high" }
- preparationPlan: array of OBJECTS shaped exactly like:
  { "day": 1, "focus": "...", "tasks": ["...", "..."] }
  ("tasks" must be an array of strings, even if there is only one task.)

Do NOT flatten any array into a list of alternating keys and values.
Do NOT return objects as JSON strings. Return real nested JSON objects.
`;
}

// One generate + normalize + validate attempt. Returns { success, data, error }.
async function attemptGeneration({ resume, selfDescription, jobDescription, previousError }) {
  const prompt = buildPrompt({ resume, selfDescription, jobDescription, previousError });

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: geminiResponseSchema,
    },
  });

  console.log("AI RESPONSE:", response.text);

  let rawParsed;
  try {
    rawParsed = JSON.parse(response.text);
  } catch (err) {
    return { success: false, error: "Response was not valid JSON: " + err.message };
  }

  const normalized = {
    matchScore: rawParsed.matchScore,
    title: rawParsed.title,
    technicalQuestions: normalizeQAField(rawParsed.technicalQuestions),
    behavioralQuestions: normalizeQAField(rawParsed.behavioralQuestions),
    skillGaps: normalizeSkillGaps(rawParsed.skillGaps),
    preparationPlan: normalizePreparationPlan(rawParsed.preparationPlan),
  };

  const result = interviewReportSchema.safeParse(normalized);
  if (!result.success) {
    console.error("AI response failed validation:", result.error.format());
    return { success: false, error: result.error.message };
  }

  return { success: true, data: result.data };
}

async function generateInterviewReport({
  resume,
  selfDescription,
  jobDescription,
}) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(`generateInterviewReport: attempt ${attempt}/${MAX_ATTEMPTS}`);

    const result = await attemptGeneration({
      resume,
      selfDescription,
      jobDescription,
      previousError: lastError,
    });

    if (result.success) {
      if (attempt > 1) {
        console.log(`generateInterviewReport: succeeded on retry ${attempt}`);
      }
      return result.data;
    }

    lastError = result.error;
    console.warn(`generateInterviewReport: attempt ${attempt} failed - ${lastError}`);
  }

  // All attempts exhausted
  throw new Error(
    `AI failed to return a valid interview report after ${MAX_ATTEMPTS} attempts: ${lastError}`,
  );
}

async function generatePdfFromHtml(htmlContent) {
    const browser = await puppeteer.launch()
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: "networkidle0" })

    const pdfBuffer = await page.pdf({
        format: "A4", margin: {
            top: "20mm",
            bottom: "20mm",
            left: "15mm",
            right: "15mm"
        }
    })

    await browser.close()

    return pdfBuffer
}

async function generateResumePdf({ resume, selfDescription, jobDescription }) {

    const resumePdfSchema = z.object({
        html: z.string().describe("The HTML content of the resume which can be converted to PDF using any library like puppeteer")
    })

    const prompt = `Generate resume for a candidate with the following details:
                        Resume: ${resume}
                        Self Description: ${selfDescription}
                        Job Description: ${jobDescription}

                        the response should be a JSON object with a single field "html" which contains the HTML content of the resume which can be converted to PDF using any library like puppeteer.
                        The resume should be tailored for the given job description and should highlight the candidate's strengths and relevant experience. The HTML content should be well-formatted and structured, making it easy to read and visually appealing.
                        The content of resume should be not sound like it's generated by AI and should be as close as possible to a real human-written resume.
                        you can highlight the content using some colors or different font styles but the overall design should be simple and professional.
                        The content should be ATS friendly, i.e. it should be easily parsable by ATS systems without losing important information.
                        The resume should not be so lengthy, it should ideally be 1-2 pages long when converted to PDF. Focus on quality rather than quantity and make sure to include all the relevant information that can increase the candidate's chances of getting an interview call for the given job description.
                    `

    const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: zodToJsonSchema(resumePdfSchema),
        }
    })


    const jsonContent = JSON.parse(response.text)

    const pdfBuffer = await generatePdfFromHtml(jsonContent.html)

    return pdfBuffer

}

module.exports = { generateInterviewReport, generateResumePdf }