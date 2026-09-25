import clipboardy from 'clipboardy';
import figlet from "figlet";
import { buildTaskSubmission } from "./lib/test-parser.js";
import { createPrompt } from "./lib/cli-input.js";
import EngDis from "./lib/engdis.lib.js";

const prompt = createPrompt();
const baseUrl = "https://edwebservices2.engdis.com/api/";
const cannonicalDomain = "ed22.engdis.com/thai";
class Main {
  setting = {
    baseUrl: "",
    username: "",
    password: "",
  };
  engdis = new EngDis();

  constructor() {
    this.welcome();
  }

  async main() {
    await this.getInput();
    const loginToken = await this.login();
    if (!loginToken) process.exit();
    this.engdis = new EngDis(this.setting.baseUrl, loginToken.UserInfo.Token);
    const courses = await this.selectCourse();
    const maxPasses = 3;
    let previousScore = "";

    for (let pass = 1; pass <= maxPasses; pass++) {
      console.log(`\n[*] pass ${pass}/${maxPasses}: unfinished lessons only`);
      await this.setTaskSuccess(courses, true);

      const progress = await this.engdis.getProgress();
      if (!Array.isArray(progress)) {
        console.log("[!] can't read progress");
        break;
      }

      console.log("Progress:", progress[0], "Grade:", progress[1]);
      if (Number(progress[0]) === 100 && Number(progress[1]) === 100) break;

      const score = `${progress[0]}:${progress[1]}`;
      if (score === previousScore) {
        console.log("[!] score unchanged; stopping retries");
        break;
      }
      previousScore = score;
    }

    // await this.logout();
  }

  async welcome() {
    console.log(figlet.textSync("English Discoveries."));
    console.log(
      "[!] Bot for student kmitl only!, updated for 2026 portal.\n"
    );
  }

  async logout() {
    console.log("\n[*] waiting logout...");
    await this.engdis.Logout();
    console.log("[#] logout success, see u soon.");
    // process.exit();
  }

  async getInput() {
    await prompt("[?] choose your subject ( fe1 or fe2 ) : ");
    this.setting.baseUrl = baseUrl;
    this.setting.username = await prompt("[?] enter your studentID  : ");
    // this.setting.username = "65050368"
    this.setting.password = this.setting.username.slice(-5);
    console.log();
  }

  async login() {
    const engdis = new EngDis(this.setting.baseUrl);
    console.log("[*] waiting...");
    let result = await engdis.Login(
      this.setting.username,
      this.setting.password,
      "5232957",
      "136",
      cannonicalDomain
    );
    if (!result.UserInfo) {
      console.log("[!] username or password is incorrect.");
    } else if (!result.UserInfo.Token) {
      console.log(
        "[!] please logout from website before use bot and try again."
      );
    } else {
      console.log(`[#] login with success.\n`);
      return result;
    }
    return;
  }

  async selectCourse() {
    let courseProgressListTable = [];
    let courseTmp = [];
    const selectAllCourse = (await prompt("[?] select all course (y/n) : ")) == "y" ? true : false;
    // const selectAllCourse = false

    console.log();
    var courseProgressList = await this.engdis.getGetDefaultCourseProgress();
    if (!courseProgressList.isSuccess) {
      console.log("[!] token die, please login again.");
      process.exit();
    }

    courseProgressList.data.map((item) => {
      if (selectAllCourse) {
        console.log(`[#] you choose course ( ${item.Name} )`);
        courseTmp.push({
          NodeId: item.NodeId,
          ParentNodeId: item.ParentNodeId,
        });
      } else {
        courseProgressListTable.push({
          Id: item.NodeId,
          Name: item.Name,
        });
      }
    });

    if (selectAllCourse) return courseTmp;

    console.table(courseProgressListTable);
    const selectId = await prompt("[?] select id or index : ");
    // const selectId = 8;

    var find = courseProgressList.data.find(
      (ele, index) => ele.NodeId == selectId || index == selectId
    );

    if (!find) {
      console.log("[!] can't find id or index", selectId);
      return [];
    }

    // console.log(`[#] you choose course ( ${find.Name} )`);
    courseTmp.push({
      NodeId: find.NodeId,
      ParentNodeId: find.ParentNodeId,
    });
    return courseTmp;
  }

  async setTaskSuccess(courses, skipCompleted = false) {
    for (let course of courses) {
      var courseTree = await this.engdis.getCourseTree(
        course.NodeId,
        course.ParentNodeId
      );

      if (!courseTree?.isSuccess || !Array.isArray(courseTree?.data)) {
        console.log(`[!] can't load course tree for node ${course.NodeId}`);
        continue;
      }

      for (const item of courseTree.data) {
        console.log(`\n[*] checking ( ${item.Name} )`);
        const subItems = Array.isArray(item.Children) ? item.Children : [];
        const testItem = subItems.find((child) => child.Name === "Test");

        if (skipCompleted && Number(testItem?.Grade) === 100) {
          console.log(`[#] skip completed lesson (${item.Name})`);
          continue;
        }

        for (const elem of subItems) {
          if (elem.Name != "Test") {
            console.log(`[#] checking ${elem.Name}`);
            const tasks = Array.isArray(elem.Children) ? elem.Children : [];

            for (const ele of tasks) {
              await this.engdis.setSucessTask(
                course.ParentNodeId,
                ele.NodeId
              );
            }
          } else {
            console.log(`[#] checking ${elem.Name}`);
            if (!item?.Metadata?.Code) {
              console.log(`[!] missing lesson code for ${item.Name}`);
              continue;
            }
            await this.setTest100Percent(item.Metadata.Code, item.NodeId, item.ParentNodeId);
          }
        }
      }
    }
  }

  async setTest100Percent(code, nodeId, parentNodeId) {
    const testData = await this.engdis.getTestCodeDigit(code);
    if (!testData || !Array.isArray(testData.tasks)) {
      console.log(`[!] can't load lesson data for ${code}`);
      return;
    }

    const submitAnswer = [];

    for (const task of testData.tasks) {
      const practiceItem = await this.engdis.practiceGetItem(
        task.id,
        task.code,
        task.type
      );

      let submission;
      try {
        submission = buildTaskSubmission(task, practiceItem?.data, {
          allowFirstAnswerFallback: true,
        });
      } catch (error) {
        console.log(`[!] invalid practice data for ${task.code}: ${error.message}`);
        continue;
      }

      if (!submission) {
        console.log(`[!] can't load practice data for ${task.code}`);
        continue;
      }

      submitAnswer.push(submission);
    }

    const testStatus = await this.engdis.SaveUserTestV1(
      nodeId,
      parentNodeId,
      submitAnswer
    );
    const finalMark = testStatus?.data?.finalMark;
    console.log(finalMark);

    if (finalMark != "100") {
      clipboardy.writeSync(JSON.stringify(submitAnswer));
      console.log(finalMark);
    }

    return finalMark;
  }
}

(async () => {
  const mainClass = new Main();
  try {
    await mainClass.main();
  } finally {
    prompt.close();
  }
})();
