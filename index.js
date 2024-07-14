import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import env from "dotenv"
import bcrypt from "bcrypt";
import session from "express-session";
import cookieParser from "cookie-parser";
import http from "http";
import WebSocket,{WebSocketServer} from "ws";

env.config();

const app = express();
const port = process.env.PORT || 3000;
// const host = '192.168.31.103';

const db = new pg.Client({
    connectionString:process.env.CONNECTION_STRING
  });
db.connect();

let chat_clients = new Map();
let message_clients = new Map();

const server = http.createServer(app)

const wss = new WebSocketServer({server : server})

wss.on('error',console.error)

wss.on('listening',() => {
    console.log('Connected')
})

wss.on('connection', function connection(ws) {
    let clientid = null;
    ws.on('error', console.error);
    ws.on('message', async function message(data) {
        data = '' + data;
        console.log('Received:'+data);
        if (data[0] == '1') {
            if (chat_clients.get(data.slice(1))) {
                let prevData = chat_clients.get(data.slice(1));
                chat_clients.set(data.slice(1),[...prevData,ws]);
                clientid = data;
            } else {
                chat_clients.set(data.slice(1),[ws]);
                clientid = data;
            }
        }
        if (data[0] == '2') {
            let client = JSON.parse(data.slice(1))
            if (message_clients.get(JSON.stringify([client[0],client[1]]))) {
                let prevData = message_clients.get(JSON.stringify([client[0],client[1]]));
                message_clients.set(JSON.stringify([client[0],client[1]]),[...prevData,ws])
            } else {
                message_clients.set(JSON.stringify([client[0],client[1]]),[ws]);
            }
            
            let second_user = client[1];
            let tosend_message = message_clients.get(JSON.stringify([second_user,client[0]]));
            if (tosend_message) {
                for (let i=0;i<tosend_message.length;i++) {
                    tosend_message[i].send('6|'+client[0]);
                }
            }
            await db.query('update messages set status=\'read\' where fromid=$1 and toid=$2;',[client[1],client[0]]);
            clientid = data;
        }
        if (data[0] == '4') {
            // console.log('Clientid :'+clientid)
            try {
                let flag = false;
                let date = new Date();
                let message = JSON.parse(data.slice(1))
                console.log(message);
                let to_username = await db.query('select username from login_credentials where id=$1;',[message[1]]);
                let username_messanger = await db.query('select username from login_credentials where id=$1;',[message[2]]);
                username_messanger = username_messanger.rows[0].username;
                let tosend_message = message_clients.get(JSON.stringify([''+message[1],''+message[2]]));
                console.log(JSON.stringify([''+message[1],''+message[2]]))
                let tosend_chat = chat_clients.get(''+message[1]);
                let inserted_data = await db.query('insert into messages(fromid,toid,messagetext,status,time) values($1,$2,$3,$4,$5) RETURNING messageid;',[message[2],message[1],message[3],'unread',date]);
                console.log(inserted_data);
                let messageid = inserted_data.rows[0].messageid;
                let contacts_data_1 = await db.query('select contactid from contacts where username=$1 and contact=$2;',[to_username.rows[0].username,username_messanger]);
                if (contacts_data_1.rows.length == 0) {
                    await db.query('insert into contacts(username,contact,time) values($1,$2,$3)',[to_username.rows[0].username,username_messanger,date]);
                    await db.query('insert into contacts(username,contact,time) values($1,$2,$3)',[username_messanger,to_username.rows[0].username,date])
                }
                if (tosend_message) {
                    console.log('To send message')
                    console.log(tosend_message)
                    for (let i=0;i<tosend_message.length;i++) {
                        tosend_message[i].send('5'+JSON.stringify([5,message[2],username_messanger,message[3],date,messageid]));
                    }
                    if (tosend_chat) {
                        for (let i=0;i<tosend_chat.length;i++) {
                            tosend_chat[i].send('5'+JSON.stringify([5,message[2],username_messanger,message[3],date]))
                        }
                    }
                } else if (tosend_chat) {
                    for (let i=0;i<tosend_chat.length;i++) {
                        tosend_chat[i].send('5'+JSON.stringify([5,message[2],username_messanger,message[3],date]))
                    }
                    flag = true;
                } else {
                    flag = true;
                }
                // if (flag) {
                console.log("clientid"+clientid)
                let client = null;
                if (clientid[0] == '2') {
                    let x = JSON.parse(clientid.slice(1));
                    client = JSON.stringify([x[0],x[1]]);
                }
                let tosend_message_2 = message_clients.get(client);
                // let tosend_chat = chat_clients.get(client);
                if (tosend_message_2) {
                    for (let i=0;i<tosend_message_2.length;i++) {
                        tosend_message_2[i].send('7'+JSON.stringify([message[3],date,message[1],messageid]))
                    }
                }

                await db.query('update contacts set time=$1 where username=$2 and contact=$3;',[date,to_username.rows[0].username,username_messanger]);
                await db.query('update contacts set time=$1 where username=$2 and contact=$3;',[date,username_messanger,to_username.rows[0].username]);
            } catch (err) {
                console.log(err);
            }
        }
        if (data[0] == 'A') {
            let message = JSON.parse(data.slice(1));
            await db.query('update messages set status=\'read\' where fromid=$1 and toid=$2;',[message[1],message[0]]);
            let second_user = message[1];
            let tosend_message = message_clients.get(JSON.stringify([second_user,message[0]]));
            if (tosend_message) {
                for (let i=0;i<tosend_message.length;i++) {
                    tosend_message[i].send('6|'+message[0]);
                }
            }
        }
        if (data[0] == 'B') {
            let message = JSON.parse(data.slice(1));
            let tosend = message_clients.get(JSON.stringify([''+message[0],''+message[1]]));
            if (tosend) {
                for (let i=0;i<tosend.length;i++) {
                    tosend[i].send('C'+message[2]);
                }
            }
        }
        if (data[0] == 'D') {
            let message = JSON.parse(data.slice(1));
            let tosend = message_clients.get(JSON.stringify([''+message[0],''+message[1]]));
            await db.query('update messages set status=\'read\' where fromid=$1 and toid=$2;',[message[0],message[1]]);
            if (tosend) {
                for (let i=0;i<tosend.length;i++) {
                    tosend[i].send('D');
                }
            }
        }
    });
    
    ws.on('close',() => {
        try {
            console.log(clientid)
            if (clientid[0] == '1') {
                let todelete = chat_clients.get(clientid.slice(1));
                for (let i=0;i<todelete.length;i++) {
                    if (todelete[i] === ws) {
                        todelete.splice(i,1);
                        console.log('Delete one item')
                        break;
                    }
                }
                if (todelete.length>0) {
                    chat_clients.set(clientid.slice(1),todelete)
                } else {
                    chat_clients.delete(clientid.slice(1));
                }
                
                // chat_clients.delete(clientid[1]);
            } else if (clientid[0] == '2') {
                let x = JSON.parse(clientid.slice(1));
                let todelete = message_clients.get(JSON.stringify([x[0],x[1]]));
                for (let i=0;i<todelete.length;i++) {
                    if (todelete[i] === ws) {
                        todelete.splice(i,1)
                        console.log('Delete one item message');
                        break;
                    }
                }
                console.log(todelete)
                if (todelete.length>0) {
                    message_clients.set(JSON.stringify([x[0],x[1]]),todelete);
                } else {
                    console.log('Completely deleted')
                    console.log(message_clients.delete(JSON.stringify([x[0],x[1]])));
                }
                
                // message_clients.delete(clientid[1]);
            }
        } catch(err) {
            console.log(err)
        }
    })
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(cookieParser());
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true,
  rolling: true,
  cookie: { 
    secure: false, 
    maxAge: 3600000
} // Set secure to true in production with HTTPS
}));

app.get("/",(req,res) => {
    if (req.session.user === undefined) {
        res.render("login.ejs")
    } else {
        res.redirect('/main/'+req.session.user);
    }
})

app.post('/login',async (req,res) => {
    try {
        let user_data = await db.query('select * from login_credentials where username=$1;',[req.body.Username.trim()]);
        if (user_data.rows.length>0) {
            let correct_password = user_data.rows[0].password;
            bcrypt.compare(req.body.Password, correct_password, function(err, result) {
                if (result) {
                    req.session.user = user_data.rows[0].id;
                    res.redirect('/main/'+req.session.user);
                } else {
                    res.render('login.ejs',{message: 'Invalid Password.'})
                }
            });
        } else {
            res.render('login.ejs',{message: 'User doesn\'t exists.'})
        }
    } catch(err) {
        console.log(err)
        res.render('login.ejs',{message: 'Something went wrong. Try again.'})
    }
})

app.get('/register',(req,res) => {
    if (req.session.user == undefined) {
        res.render('register.ejs')
    } else {
        res.redirect('/main/'+req.session.user)
    }
})

app.post('/register',async (req,res) => {
    try {
        let user_exist_data = await db.query('select * from login_credentials where username=$1;',[req.body.Username.trim()]);
        if (user_exist_data.rows.length>0) {
            res.render('register.ejs',{message: 'User already exists.'})
        } else {
            bcrypt.hash(req.body.Password, 10, async function(err, hash) {
                try {
                    await db.query('insert into login_credentials(username,password) values($1,$2);',[req.body.Username.trim(),hash])
                    res.redirect('/')
                } catch (err) {
                    res.render('register.ejs',{message: 'Something went wrong. Try again.'})
                    console.log(err)
                }
            });
        }
    } catch(err) {
        res.render('register.ejs',{message: 'Something went wrong. Try again.'})
        console.log(err)
    }
})

app.get('/main/:user_id',async (req,res) => {
    if (req.session.user == req.params.user_id) {
        let username = await db.query('select username from login_credentials where id=$1;',[req.params.user_id]);
        username = username.rows[0].username;
        let contacts_data = await db.query('select * from contacts where username=$1 order by time desc;',[username]);
        contacts_data = contacts_data.rows;
        let contacts = [];
        let contactids = [];
        let unread_messages = [];
        for (let i=0;i<contacts_data.length;i++) {
            contacts.push(contacts_data[i].contact);
            let contact_ids_data = await db.query('select id from login_credentials where username=$1;',[contacts_data[i].contact]);
            contactids.push(contact_ids_data.rows[0].id);
            let unread_messages_data = await db.query('select count(*) count from messages where fromid=$1 and toid=$2 and status=\'unread\'',[contactids[i],req.params.user_id]);
            unread_messages.push(unread_messages_data.rows[0].count);
        }
        res.render('main.ejs',{contacts: contacts,contactids: contactids, unread_messages, user_id: req.params.user_id});
    } else {
        res.send('Unauthorised')
    }
});

app.get('/new-message/:user_id',(req,res) => {
    if (req.session.user == req.params.user_id) {
        res.render('new-message.ejs',{user_id: req.params.user_id});
    } else {
        res.send('Unauthorised');
    }
});

app.post('/new-message/:user_id',async (req,res) => {
    if (req.session.user == req.params.user_id) {
        let second_user_data = await db.query('select * from login_credentials where username=$1;',[req.body.username]);
        if (second_user_data.rows.length > 0) {
            let second_user_id = second_user_data.rows[0].id;
            res.redirect('/chat/'+req.params.user_id+'/'+second_user_id);
        } else {
            res.render('new-message.ejs',{message: 'Cannot find the username.',user_id:req.params.user_id});
        }
    } else {
        res.send('Unauthorised')
    }
});

app.get('/chat/:user_id/:second_user',async (req,res) => {
    if (req.session.user == req.params.user_id) {
        let messages_data = await db.query('select * from messages where (fromid=$1 and toid=$2) or (fromid=$2 and toid=$1) order by time;',[req.params.user_id,req.params.second_user]);
        messages_data = messages_data.rows;
        let chat_username = await db.query('select username from login_credentials where id=$1;',[req.params.second_user]);
        chat_username = chat_username.rows[0].username;
        let messages = [];
        let status = [];
        let time = [];
        let fromto = [];
        for (let i=0;i<messages_data.length;i++) {
            messages.push(messages_data[i].messagetext);
            status.push(messages_data[i].status);
            // console.log(time)
            time.push(messages_data[i].time);
            let fromto_data = await db.query('select * from messages where messageid=$1;',[messages_data[i].messageid]);
            if (fromto_data.rows[0].fromid == req.params.user_id) {
                fromto.push(true);
            } else {
                fromto.push(false);
            }
        }
        res.render('chat.ejs',{messages:messages,status: status,time: time,fromto: fromto,chat_username:chat_username,user_id: req.params.user_id,second_user: req.params.second_user});
    } else {
        res.send('Unauthorised')
    }
})

server.listen(5000,() => {
    console.log(`Connected on URL`)
})