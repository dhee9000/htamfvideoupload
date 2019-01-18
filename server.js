var http = require('http').createServer(handler)
    , io = require('socket.io').listen(http)
    , fs = require('fs')
    , exec = require('child_process').exec
    , execSync = require('child_process').execSync
    , spawn = require('child_process').spawn
    , util = require('util')
    , ffmpeg = require('fluent-ffmpeg')
    , express = require('express');

var app = express();

app.listen(8080);

http.listen(69);

console.log("Running on port 8080");

var Files ={};

app.use(express.static('public'));
app.use("/video", express.static('Video'));

function handler (req, res) {

}

io.sockets.on('connection', function (socket) {
  socket.on('Start', function (data) { //data contains the variables that we passed through in the html file
    var Name = data['Name'];
    Files[Name] = {  //Create a new Entry in The Files Variable
        FileSize : data['Size'],
        Data   : "",
        Downloaded : 0
    }
    var Place = 0;
    try{
        var Stat = fs.statSync('Temp/' +  Name);
        if(Stat.isFile())
        {
            Files[Name]['Downloaded'] = Stat.size;
            Place = Stat.size / 524288;
        }
    }
    catch(er){} //It's a New File
    fs.open("Temp/" + Name, "a", 0755, function(err, fd){
        if(err)
        {
            console.log(err);
            Files[Name]['Data'] = ""; //Reset The Buffer
            var Place = Files[Name]['Downloaded'] / 524288;
            var Percent = (Files[Name]['Downloaded'] / Files[Name]['FileSize']) * 100;
            socket.emit('MoreData', { 'Place' : Place, 'Percent' :  Percent});
        }
        else
        {
            Files[Name]['Handler'] = fd; //We store the file handler so we can write to it later
            socket.emit('MoreData', { 'Place' : Place, Percent : 0 });
        }
    });
  });
  socket.on('Upload', function (data){
    var Name = data['Name'];
    console.log("Chunk Received for " + Name + "!")
    Files[Name]['Downloaded'] += data['Data'].length;
    Files[Name]['Data'] += data['Data'];
    if(Files[Name]['Downloaded'] == Files[Name]['FileSize']) //If File is Fully Uploaded
    {
        console.log("All file data received for " + Name + "!");
        var Place = Files[Name]['Downloaded'] / 524288;
        fs.write(Files[Name]['Handler'], Files[Name]['Data'], null, 'Binary', function(err, Writen){
          var inp = fs.createReadStream("Temp/" + Name);
          var out = fs.createWriteStream("Video/" + Name);
          console.log("Writing " + Name + " to final dir!")
          var op = inp.pipe(out)
          op.on('finish', () => {
            fs.unlink("Temp/" + Name, () => {
              console.log("Combining Intro and Outro on " + Name);

              var cmd = 'ffmpeg';
              var filename = Name;
              var nameOnly = filename.split(".")[0];

              cmdFull = 'ffmpeg -i Source/Intro.mp4 -i Video/' + filename + ' -i Source/Outro.mp4 -f lavfi -i color=black -filter_complex "[1:v]scale=w=1920:h=1080:force_original_aspect_ratio=2[scaled]; [scaled]crop=1920:1080[cropped]; [cropped]fps=30[fpsset]; [0:v]fade=t=out:st=6:d=1:alpha=1, setpts=PTS-STARTPTS[introfade]; [introfade][0:a][fpsset][1:a][2:v][2:a]concat=n=3:v=1:a=1[outv][outa]" -map "[outv]" -map "[outa]" Video/' + nameOnly + '_Final.mp4';

              fs.writeFileSync("convert.bat", cmdFull);
              fs.chmodSync("convert.bat", '755');

              var args = [
                '-i', 'Source/Intro.mp4',
                '-i', 'Video/' + filename,
                '-i', 'Source/Outro.mp4',
                '-f', 'lavfi',
                '-i', 'color=black',
                '-filter_complex', '"[1:v]scale=w=1920:h=1080:force_original_aspect_ratio=2[scaled]; [scaled]crop=1920:1080[cropped]; [cropped]fps=30[fpsset]; [0:v]fade=t=out:st=6:d=1:alpha=1, setpts=PTS-STARTPTS[introfade]; [introfade][0:a][fpsset][1:a][2:v][2:a]concat=n=3:v=1:a=1[outv][outa]"',
                '-map', '[outv]',
                '-map', '[outa]',
                '-f', 'mp4', 'Video/' + filename + '_Final.mp4'
              ];

              console.log("FFMPEG Starting Convert and Combine");

              var proc = exec("./convert.bat")
              proc.on('exit', ()=> {
                socket.emit('Done', {'URL': 'video/' + Name.split(".")[0] + "_Final.mp4"});
                console.log("All operations on " + Name + " finished!");
              });
            });
          });
        });
    }
    else if(Files[Name]['Data'].length > 10485760){ //If the Data Buffer reaches 10MB
        console.log("Buffer write on " + Name);
        fs.write(Files[Name]['Handler'], Files[Name]['Data'], null, 'Binary', function(err, Writen){
            Files[Name]['Data'] = ""; //Reset The Buffer
            var Place = Files[Name]['Downloaded'] / 524288;
            var Percent = (Files[Name]['Downloaded'] / Files[Name]['FileSize']) * 100;
            socket.emit('MoreData', { 'Place' : Place, 'Percent' :  Percent});
        });
    }
    else
    {
        var Place = Files[Name]['Downloaded'] / 524288;
        var Percent = (Files[Name]['Downloaded'] / Files[Name]['FileSize']) * 100;
        socket.emit('MoreData', { 'Place' : Place, 'Percent' :  Percent});
    }
  });
});
