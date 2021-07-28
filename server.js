/* INSERT CODE HERE */
const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const cryptoRandomString = require('crypto-random-string');

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(__dirname));
// http://expressjs.com/en/starter/static-files.html
app.use(express.static('public'));

// http://expressjs.com/en/starter/basic-routing.html
app.get('/', function(request, response) {
  response.sendFile(__dirname + '/views/index.html');
});
        
const listener = app.listen(process.env.PORT, () => {
  console.log('Your app is listening on port ' + listener.address().port);
});

/* 
  This is an endpoint that Intercom will POST HTTP request when the card needs to be initialized.
  This can happen when your teammate inserts the app into the inbox, or a new conversation is viewed.
*/
const https = require('https')

const state = cryptoRandomString({length: 20});

let globalTokens = {}

app.get("/callback", async (request, response) => {
  
  // console.log(request.query.code)
  const config = {
    method: 'post',
    url: `https://api.intercom.io/auth/eagle/token?code=${request.query.code}&client_id=379b5c31-c618-4cab-8e68-b7b30a80467d&client_secret=1b90b095-4982-463f-b70b-84082687dc2b`,
    headers: { }
  };
  let res
  try {
    res = await axios(config)
    // console.log("res: " + res);
    // console.log(JSON.stringify(res.data));
  } catch(err) {
    console.log(err);
    res.redirect("https://app.intercom.com/appstore/redirect?error_message=Installation Failed.")
  } 

  // console.log(res.data.token)
  const rsp = res.data.token
  const token = rsp.token
  response.redirect("https://app.intercom.com/appstore/redirect?install_success=true")
});


app.post("/initialize", async (request, response) => {  
  const body = request.body;
  console.log("--------------INITIALIZE--------------")
  //token exists
  if(body.admin.id in globalTokens) {
     response.send({
       canvas: {
         content: {
           components: [
             {type: "button", id: "doneButton", label: "Create Task", style: "secondary", action: {type: "submit"}}
           ]
         },
         stored_data: {'apiToken': globalTokens[body.admin.id]}
       }
     })
  }
  
  //new user
  else {
      response.send({
        canvas: {
          content: {
            components: [
              { type: "text", id: "apiTokenText", text: "Enter Todoist API Token", align: "center", style: "header" },
              { type: "input", id: "apiToken", save_state: "unsaved"},
              { type: "button", label: "Enter", style: "secondary", id: "newTokenButton", action: {type: "submit"} },
            ], 
          },
        },
    });
  }
  
});
  

app.post("/submit", async (request, response) => {  
  console.log("-------------------SUBMIT---------------------")
  let body = request.body; //this is the data from intercom
  
  
  //new user token
  if(body.component_id == "newTokenButton") {
    globalTokens[body.admin.id] = body.input_values.apiToken
    response.send({
      canvas: {
        content: {
          components: [
            {type: "text", text: "Token Added", align: "center", style:"header"},
            {type: "button", id: "doneButton", label: "Create Task", style: "secondary", action: {type: "submit"}},
          ]
        },
        stored_data: {'apiToken': body.input_values.apiToken}
      }
    })
  }
  
  //create task form below
  else if(body.component_id == "doneButton") {
      
      console.log("-----------Form-----------")
      const token = body.current_canvas.stored_data.apiToken
      // console.log(token)
    
    //getting data from todoist
      // console.log(body)
      let data
      const config = {
        method: 'get',
        url: 'https://api.todoist.com/rest/v1/projects',
        headers: { 
          'Authorization': 'Bearer ' + token
        }
      };
      try {
        const displayData = function (response) {
          data = JSON.parse(JSON.stringify(response.data))
          // console.log(typeof(data))
          // console.log(data);
        }
        const res = await axios(config)
        const promise = await displayData(res)
        } catch(err) {
        console.error(err)
      }
    //END of getting data from todoist

    //Form elements below
      let name = ""
      if(body.customer.name)
        name = body.customer.name
      else
        name = body.customer.pseudonym
      let projectDropdown = []
      let priorityList = []
      for(let i=0;i<4;i++) {
        priorityList.push({
          "type": "option",
          "id": 4-i,
          "text": "Priority " + (i+1)
        })
  }
      let dueDates = [ 
        {"type": "option", "id": "today", "text": "Today"},
        {"type": "option", "id": "tomorrow", "text": "Tomorrow"},
      ]
      data = Array.prototype.slice.call(data);
      data.forEach(project => {
        projectDropdown.push({
          "type": "option",
          "id": project.id,
          "text": project.name,
        });
  });
      const attachments = [
        {
          type: "option",
          id: "convo",
          text: "Attach Conversation"
        },
        {
          type: "option",
          id: "contact",
          text: "Attach Contact"
        }
      ]
      const url = 'https://app.intercom.com/a/apps/' + body.workspace_id + "/inbox/inbox/" + body.admin.id + "/conversations/" + body.conversation.id
    // Form elements END
      
      response.send({
        canvas: {
          content: {
            components: [
              { type: "text", id: "text-component-1", text: "Hey there!", align: "center", style: "header" },
              { type: "dropdown", id: "projectID", label: "Select a project", options: projectDropdown},
              { type: "input", id: "task", label: "Create Task", value: name, save_state: "unsaved"},
              { type: "dropdown", id: "priority", label: "Priority", options: priorityList},
              { type: "dropdown", id: "dueDate", label: "Due Date", options: dueDates},
              { type: "checkbox", id: "attachments", options: attachments},
              { type: "button", label: "Create Task", style: "primary", id: "createTaskButton", action: {type: "submit"} },
            ], 
          },
          stored_data: { 'apiToken': token}
        },
    });
  }
  
  //task created message below
  else if(body.component_id == "createTaskButton") {
    
    console.log("----------------Write to Todoist----------------")
    // console.log(body.current_canvas.stored_data.apiToken)
    const token = body.current_canvas.stored_data.apiToken;
    let msg = "Success!"
    //writing to todoist
    let data = {
      "content": body.input_values.task, 
      "project_id": parseInt(body.input_values.projectID), 
      "priority": parseInt(body.input_values.priority),
      "due_string": body.input_values.dueDate
    }
    const config = {
      method: 'post',
      url: 'https://api.todoist.com/rest/v1/tasks',
      headers: { 
        'X-Request-Id': uuidv4(), 
        'Content-Type': 'application/json', 
        'Authorization': 'Bearer ' + token
      },
      data : data
    }
    let res
    try {
    res = await axios(config)
    // console.log(JSON.stringify(res.data))
    } catch(err) {
      console.log("------------------------OOPS------------------------------")
      console.log(err);
      msg = "OOPS. Something went wrong"
    };

    //attach conversation
    if(body.input_values.attachments.includes('convo')) {
      const url = 'https://app.intercom.com/a/apps/' + body.workspace_id + "/inbox/inbox/" + body.admin.id + "/conversations/" + body.conversation.id
      let data = {
        "content": "Conversation: " + url,
        "project_id": parseInt(body.input_values.projectID),
        "parent_id": res.data.id,
      }
      const config = {
        method: 'post',
        url: 'https://api.todoist.com/rest/v1/tasks',
        headers: { 
          'X-Request-Id': uuidv4(), 
          'Content-Type': 'application/json', 
          'Authorization': 'Bearer ' + token
        },
        data : data
      }
      try {
        const res = await axios(config)
        // console.log(JSON.stringify(res.data))
      } catch(err) {
        console.log("------------------------OOPS------------------------------")
        console.log(err);
      }
    }
    //attach contact
    if(body.input_values.attachments.includes('contact')) {
      const url = 'https://app.intercom.com/a/apps/' + body.workspace_id + "/users/" + body.customer.id + "/all-conversations"
      let data = {
        "content": "Contact: " + url,
        "project_id": parseInt(body.input_values.projectID),
        "parent_id": res.data.id,
      }
      const config = {
        method: 'post',
        url: 'https://api.todoist.com/rest/v1/tasks',
        headers: { 
          'X-Request-Id': uuidv4(), 
          'Content-Type': 'application/json', 
          'Authorization': 'Bearer ' + token
        },
        data : data
      }
      try {
        const res = await axios(config)
        // console.log(JSON.stringify(res.data))
      } catch(err) {
        console.log("------------------------OOPS------------------------------")
        console.log(err);
      }
    }

    //end of writing to todoist
    response.send({
      canvas: {
        content: {
          components: [
            { type: "text", id: "text-component-1", text: msg, align: "center", style: "header" },
            { type: "button", label: "Create another Task", style: "secondary", id: "doneButton", action: {type: "submit"} },
          ],
        },
        stored_data: { 'apiToken': token}
      },
    });
  }
});