import clipboardy from 'clipboardy';
import figlet from "figlet";
import { selectCorrectAnswers } from "./lib/test-parser.js";
import PromptSync from "prompt-sync";
import EngDis from "./lib/engdis.lib.js";

const prompt = PromptSync({ sigint: true });
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
    let courses = await this.selectCourse();
    await this.setTaskSuccess(courses);

    const progress = await this.engdis.getProgress();
    console.log("Progress:", progress[0], "Grade:", progress[1])

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

  async setTaskSuccess(courses) {
    for (let course of courses) {
      var courseTree = await this.engdis.getCourseTree(
        course.NodeId,
        course.ParentNodeId
      );
      
      for (const item of courseTree.data) {
        console.log(`\n[*] checking ( ${item.Name} )`);

        for (const elem of item.Children) {
          if (elem.Name != "Test") {
            console.log(`[#] checking ${elem.Name}`);

            for (const ele of elem.Children) {
              await this.engdis.setSucessTask(
                course.ParentNodeId,
                ele.NodeId
              );
            }
          } else {
            console.log(`[#] checking ${elem.Name}`)
            await this.setTest100Percent(item["Metadata"]["Code"], item["NodeId"], item["ParentNodeId"])
          }
        }
      }

      // for (const item of courseTree["data"]) {
      //   console.log(`\n[*] checking ( ${item.Name} )`);

      //   for (const elem of item["Children"]) {
      //     if (elem.Name != "Test") {
      //       console.log(`[#] checking ${elem.Name}`);

      //       for (const ele of elem["Children"]) {
      //         await this.engdis.setSucessTask(
      //           course.ParentNodeId,
      //           ele.NodeId
      //         );
      //       }
      //     } else {
      //       console.log(`[#] checking ${elem.Name}`)
      //       await this.setTest100Percent(item["Metadata"]["Code"], item["NodeId"], item["ParentNodeId"])
      //     }
      //   }
      // }

    }
  }

  async setTest100Percent(code, nodeId, parentNodeId) {
    const testData = await this.engdis.getTestCodeDigit(code)
    if (!testData || !Array.isArray(testData.tasks)) {
      console.log(`[!] can't load lesson data for ${code}`);
      return;
    }

    var submitAnswer = [];

    for (var data of testData["tasks"]) {
      const id = data["id"]
      const code = data["code"]
      const type = data["type"]
      const testAnswerData = await this.engdis.practiceGetItem(
        id,
        code,
        type
      )
      const questions = testAnswerData?.data?.i?.q
      if (!Array.isArray(questions)) {
        console.log(`[!] can't load practice data for ${code}`)
        continue
      }

      let answerUa;
      try {
        answerUa = selectCorrectAnswers(questions);
      } catch (error) {
        console.log(`[!] invalid practice data for ${code}: ${error.message}`);
        continue;
      }

      if (answerUa.length === 0) continue;

      submitAnswer.push({
        iId: id,
        iCode: code,
        iType: type,
        ua: [{ qId: 1, aId: answerUa }],
      });
    }

    const testStatus = await this.engdis.SaveUserTestV1(nodeId, parentNodeId, submitAnswer)
    console.log(testStatus["data"]["finalMark"])

    if (testStatus["data"]["finalMark"] != "100") {
      clipboardy.writeSync(JSON.stringify(submitAnswer))
      console.log(testStatus["data"]["finalMark"])
    }
  }
}

(async () => {
  const mainClass = new Main();
  mainClass.main();
})();
