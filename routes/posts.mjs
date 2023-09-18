import express from "express";
import db from "../db/conn.mjs";
import { v4 as uuidv4 } from "uuid"; // You may need to install this package
import bcrypt from "bcryptjs";

const router = express.Router();

// Middleware to check if the user is an admin
const isAdmin = (req, res, next) => {
  const { username, password } = req.body;
  // Check if the username and password match the admin credentials
  if (username === "admin" && password === "12345678") {
    req.isAdmin = true;
    next();
  } else {
    res.status(401).send("Unauthorized");
  }
};

// Middleware to check if the user is a manager and has valid credentials
const isManager = async (req, res, next) => {
  const { username, password } = req.body;
  console.log(req.body)
  // Check the manager's credentials in a manager collection
  const managerCollection = await db.collection("managers");
  const manager = await managerCollection.findOne({ username });

  if (manager) {
    // Compare the provided password with the stored hashed password
    const isPasswordValid = await bcrypt.compare(password, manager.passwordHash);

    if (isPasswordValid) {
      req.isManager = true;
      next();
    } else {
      res.status(401).send("Unauthorized");
    }
  } else {
    res.status(401).send("Unauthorized");
  }
};


// Middleware to check if the user is an admin for GET requests
const isAdminForGET = (req, res, next) => {
  const { username, password } = req.query; // Use query parameters for GET requests
  // Check if the username and password match the admin credentials
  if (username === "admin" && password === "12345678") {
    req.isAdmin = true;
    next();
  } else {
    res.status(401).send("Unauthorized");
  }
};

// Middleware to check if the user is a manager for GET requests
const isManagerForGET = async (req, res, next) => {
  const { username, password } = req.query; // Use query parameters for GET requests

  // Check the manager's credentials in a manager collection
  const managerCollection = await db.collection("managers");
  const manager = await managerCollection.findOne({ username });

  if (manager) {
    // Compare the provided password with the stored hashed password
    const isPasswordValid = await bcrypt.compare(
      password,
      manager.passwordHash
    );

    if (isPasswordValid) {
      req.isManager = true;
      next();
    } else {
      res.status(401).send("Unauthorized");
    }
  } else {
    res.status(401).send("Unauthorized");
  }
};


// Login as an admin (POST request)
router.post("/login/admin", isAdmin, (req, res) => {
  if (req.isAdmin) {
    res.status(200).send("Authorized");
  } else {
    res.status(401).send("Unauthorized");
  }
});

// Login as a manager (POST request)
router.post("/login/manager", isManager, (req, res) => {
  if (req.isManager) {
    res.status(200).send("Authorized");
  } else {
    res.status(401).send("Unauthorized");
  }
});


// Create a new SurveyBox (admin only)
router.post("/survey-boxes", isAdmin, async (req, res) => {
  const { name, managers } = req.body;
  const boxId = uuidv4(); // Generate a unique box ID

  // Check if a SurveyBox with the same name already exists
  const existingBox = await db.collection("survey_boxes").findOne({ name });
  if (existingBox) {
    return res
      .status(400)
      .send("SurveyBox with the same name already exists.");
  }

  const collection = await db.collection("survey_boxes");
  const result = await collection.insertOne({
    _id: boxId,
    name,
    managers: managers || [], // Managers can be specified during creation
    boxId, // Store boxId as its own property
  });

  res.status(201).json(result);
});


// Create a new manager in a SurveyBox (admin only)
router.post("/survey-boxes/:boxId/managers", isAdmin, async (req, res) => {
  const { boxId } = req.params;
  const { managerUsername, managerPassword } = req.body; // Separate manager username and password

  // Check if a manager with the same username already exists
  const existingManager = await db
    .collection("managers")
    .findOne({ username: managerUsername });
  if (existingManager) {
    return res
      .status(400)
      .send("Manager with the same username already exists.");
  }

  // Hash the manager password before storing it
  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(managerPassword, saltRounds);

  const collection = await db.collection("managers");
  const result = await collection.insertOne({
    username: managerUsername,
    passwordHash,
    boxId, // Link manager to the SurveyBox they belong to
  });

  if (result.acknowledged) {
    // Update the survey box document to include the new manager
    const surveyBoxCollection = await db.collection("survey_boxes");
    const surveyBox = await surveyBoxCollection.findOne({ _id: boxId });

    if (surveyBox) {
      // Add the manager's ID to the managers array
      surveyBox.managers.push(managerUsername); // Assuming the manager ID is unique

      // Update the survey box document with the new managers list
      const updateResult = await surveyBoxCollection.updateOne(
        { _id: boxId },
        { $set: { managers: surveyBox.managers } }
      );

      if (updateResult.acknowledged) {
        res.status(201).send("Manager added successfully.");
      } else {
        res.status(500).send("Failed to update the survey box.");
      }
    } else {
      res.status(404).send("SurveyBox not found.");
    }
  } else {
    res.status(400).send("Manager could not be added.");
  }
});



// Create a new survey in a SurveyBox (admin only)
router.post("/admin/survey-boxes/:boxId/surveys", isAdmin, async (req, res) => {
  const { boxId } = req.params;
  const { name, questions } = req.body;

  // Check if the user is an admin
  if (req.isAdmin) {
    // Check if a SurveyBox with the specified ID exists
    const collection = await db.collection("surveys");

    // Check if a survey with the same name already exists
    const existingSurvey = await collection.findOne({ name, boxId });

    if (existingSurvey) {
      res.status(400).send("Survey with the same name already exists.");
    } else {
      // Generate a unique survey ID
      const surveyId = uuidv4();

      // Create the survey object
      const survey = {
        _id: surveyId,
        boxId, // Link survey to the SurveyBox it belongs to
        name,
        questions,
      };

      const result = await collection.insertOne(survey);

      if (result.acknowledged) {
        res.status(201).json(survey);
      } else {
        res.status(400).send("Survey could not be created.");
      }
    }
  } else {
    res.status(403).send("Forbidden");
  }
});



// Create a new survey response (manager or survey participant)
router.post("/survey-responses/:surveyId", isManager, async (req, res) => {
  const { surveyId } = req.params;
  const { answers } = req.body;

  // Check if the user is a manager or a survey participant
  if (req.isManager) {
    // Check if the survey exists
    const surveyCollection = await db.collection("surveys");
    const survey = await surveyCollection.findOne({ _id: surveyId });

    if (survey) {
      // Generate a unique response ID
      const responseId = uuidv4();

      // Create the survey response object
      const response = {
        _id: responseId, // Unique response ID
        surveyId: surveyId,
        answers: answers.map((answer) => ({
          question: answer.question, // Question text
          selectedOption: answer.selectedOption, // Selected option
        })),
      };

      // Save the survey response to the database
      const responseCollection = await db.collection("survey_responses");
      const result = await responseCollection.insertOne(response);

      if (result.acknowledged) {
        res.status(201).send("Survey response submitted successfully.");
      } else {
        res.status(400).send("Survey response could not be saved.");
      }
    } else {
      res.status(404).send("Survey not found.");
    }
  } else {
    res.status(403).send("Forbidden");
  }
});



// Get all survey boxes that a manager can access
router.get("/manager/:managerId/survey-boxes", isManagerForGET, async (req, res) => {
  const { managerId } = req.params;

  // Find all survey boxes where the manager's ID is in the managers array
  const surveyBoxesCollection = await db.collection("survey_boxes");
  const surveyBoxes = await surveyBoxesCollection
    .find({ managers: managerId })
    .toArray();

  res.status(200).json(surveyBoxes);
});
// Get all surveys in a survey box
router.get("/survey-boxes/:boxId/surveys", isManagerForGET, async (req, res) => {
  const { boxId } = req.params;

  // Find all surveys in the specified survey box without projection
  const surveyCollection = await db.collection("surveys");
  const surveys = await surveyCollection
    .find({ boxId })
    .toArray(); // No projection, so it includes all survey data

  res.status(200).json(surveys);
});


// Get all survey responses for a survey (with titles)
router.get("/surveys/:surveyId/responses", isManagerForGET, async (req, res) => {
  const { surveyId } = req.params;

  // Find the survey by ID
  const surveyCollection = await db.collection("surveys");
  const survey = await surveyCollection.findOne({ _id: surveyId });

  if (!survey) {
    return res.status(404).send("Survey not found.");
  }

  // Find all responses for the survey
  const responseCollection = await db.collection("survey_responses");
  const responses = await responseCollection
    .find({ surveyId })
    .project({ _id: 0, answers: 1 }) // Include only answers and exclude the response ID
    .toArray();

  const responseData = responses.map((response, index) => ({
    title: `Response ${index + 1}`,
    answers: response.answers,
  }));

  res.status(200).json(responseData);
});

// Get all survey responses for a survey (without titles)
router.get("/surveys/:surveyId/responses-flat", isManagerForGET, async (req, res) => {
  const { surveyId } = req.params;

  // Find all responses for the survey
  const responseCollection = await db.collection("survey_responses");
  const responses = await responseCollection
    .find({ surveyId })
    .toArray();

  res.status(200).json(responses);
});

// Get all survey boxes (admin only)
router.get("/survey-boxes", isAdminForGET, async (req, res) => {
  // Check if the user is an admin
  if (req.isAdmin) {
    const surveyBoxesCollection = await db.collection("survey_boxes");
    const surveyBoxes = await surveyBoxesCollection.find({}).toArray();
    res.status(200).json(surveyBoxes);
  } else {
    res.status(403).send("Forbidden");
  }
});


// Get a single survey by ID
router.get("/surveys/:surveyId", isManagerForGET, async (req, res) => {
  const { surveyId } = req.params;

  // Find the survey by its ID
  const surveyCollection = await db.collection("surveys");
  const survey = await surveyCollection.findOne({ _id: surveyId });

  if (!survey) {
    return res.status(404).send("Survey not found.");
  }

  res.status(200).json(survey);
});


// Get a single survey by ID (admin only)
router.get("/admin/surveys/:surveyId", isAdminForGET, async (req, res) => {
  const { surveyId } = req.params;

  // Check if the user is an admin
  if (req.isAdmin) {
    // Find the survey by its ID
    const surveyCollection = await db.collection("surveys");
    const survey = await surveyCollection.findOne({ _id: surveyId });

    if (!survey) {
      return res.status(404).send("Survey not found.");
    }

    res.status(200).json(survey);
  } else {
    res.status(403).send("Forbidden");
  }
});


// Count answer selections for each question in the survey (GET request)
router.get("/survey-score/:surveyId", isManagerForGET, async (req, res) => {
  const { surveyId } = req.params;

  // Find the survey by its ID
  const surveyCollection = await db.collection("surveys");
  const survey = await surveyCollection.findOne({ _id: surveyId });

  if (!survey) {
    return res.status(404).send("Survey not found.");
  }

  // Find all responses for the survey
  const responseCollection = await db.collection("survey_responses");
  const responses = await responseCollection.find({ surveyId }).toArray();

  // Initialize a scoring object to store the counts
  const scoring = {};

  // Initialize the scoring object with question and answer options
  survey.questions.forEach((question) => {
    scoring[question.text] = {};

    question.options.forEach((option) => {
      scoring[question.text][option] = 0;
    });
  });

  // Count selections for each answer option
  responses.forEach((response) => {
    response.answers.forEach((answer) => {
      scoring[answer.question][answer.selectedOption]++;
    });
  });

  // Modify the survey data to include scores
  const surveyWithScores = {
    _id: survey._id,
    boxId: survey.boxId,
    name: survey.name,
    questions: survey.questions.map((question) => ({
      text: question.text,
      options: question.options.map((option) => ({
        option: option,
        score: scoring[question.text][option],
      })),
    })),
  };

  res.status(200).json(surveyWithScores);
});

// Get a single survey by ID (admin only)
router.get("/admin/surveys/:surveyId", isAdminForGET, async (req, res) => {
  const { surveyId } = req.params;

  // Check if the user is an admin
  if (req.isAdmin) {
    // Find the survey by its ID
    const surveyCollection = await db.collection("surveys");
    const survey = await surveyCollection.findOne({ _id: surveyId });

    if (!survey) {
      return res.status(404).send("Survey not found.");
    }

    res.status(200).json(survey);
  } else {
    res.status(403).send("Forbidden");
  }
});

// Count answer selections for each question in the survey (GET request - admin only)
router.get("/admin/survey-score/:surveyId", isAdminForGET, async (req, res) => {
  const { surveyId } = req.params;

  // Check if the user is an admin
  if (req.isAdmin) {
    // Find the survey by its ID
    const surveyCollection = await db.collection("surveys");
    const survey = await surveyCollection.findOne({ _id: surveyId });

    if (!survey) {
      return res.status(404).send("Survey not found.");
    }

    // Find all responses for the survey
    const responseCollection = await db.collection("survey_responses");
    const responses = await responseCollection.find({ surveyId }).toArray();

    // Initialize a scoring object to store the counts
    const scoring = {};

    // Initialize the scoring object with question and answer options
    survey.questions.forEach((question) => {
      scoring[question.text] = {};

      question.options.forEach((option) => {
        scoring[question.text][option] = 0;
      });
    });

    // Count selections for each answer option
    responses.forEach((response) => {
      response.answers.forEach((answer) => {
        scoring[answer.question][answer.selectedOption]++;
      });
    });

    // Modify the survey data to include scores
    const surveyWithScores = {
      _id: survey._id,
      boxId: survey.boxId,
      name: survey.name,
      questions: survey.questions.map((question) => ({
        text: question.text,
        options: question.options.map((option) => ({
          option: option,
          score: scoring[question.text][option],
        })),
      })),
    };

    res.status(200).json(surveyWithScores);
  } else {
    res.status(403).send("Forbidden");
  }
});


// Get all surveys in a survey box (admin only)
router.get("/admin/survey-boxes/:boxId/surveys", isAdminForGET, async (req, res) => {
  const { boxId } = req.params;

  // Check if the user is an admin
  if (req.isAdmin) {
    // Find all surveys in the specified survey box without projection
    const surveyCollection = await db.collection("surveys");
    const surveys = await surveyCollection
      .find({ boxId })
      .toArray(); // No projection, so it includes all survey data

    res.status(200).json(surveys);
  } else {
    res.status(403).send("Forbidden");
  }
});


// Get the total number of collected responses for a survey (admin only)
router.get("/admin/surveys/:surveyId/total-responses", isAdminForGET, async (req, res) => {
  const { surveyId } = req.params;

  // Check if the user is an admin
  if (req.isAdmin) {
    // Find all responses for the survey
    const responseCollection = await db.collection("survey_responses");
    const responseCount = await responseCollection.countDocuments({ surveyId });

    res.status(200).json({ totalResponses: responseCount });
  } else {
    res.status(403).send("Forbidden");
  }
});



export default router;
