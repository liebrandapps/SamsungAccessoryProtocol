/* global define, console */

var providerApp="";
var agent = null;
var socket = null;
var channel = 104;
var currentRequest=null;
var receiveCb=null;
var failCb=null;
var notifyCb=null;
var requestQueue=[];
var isBusy=false;
var isInitializing=false;

define({
	name: 'mysap',
	def: function MySap() {
		'use strict';
		
		function configure(providerAppName, communicationChannel, receiveCallback, failCallback, notifyCallback) {
			providerApp = providerAppName;
			channel = communicationChannel;
			receiveCb = receiveCallback;
			failCb = failCallback;
			notifyCb = notifyCallback;
		}
		
		function initializeSAP() {
			try {
				isInitializing=true;
				webapis.sa.setDeviceStatusListener(deviceStatusChange);
				webapis.sa.requestSAAgent(receiveAgents);
				console.log("Requested SAP initialization");
				notifyCb({ idx:88 , msg:"Initializing Communication"} );
			}
			catch(err) {
				console.log("exception [" + err.name + "] msg [" + err.message + "]");
			}
		} 
		function sapRequest(reqData) {
			currentRequest={
					reqData : reqData
			};
			if(socket===null || !socket.isConnected()) {
				requestQueue.push(currentRequest);
				notifyCb({ id : 93, msg : "Queuing Request (init)"});
				initializeSAP();
			}
			else {
				if(!isBusy && !isInitializing) {
					socket.sendData(channel, JSON.stringify(reqData));
					notifyCb({ id : 94, msg : "Request sent"});
				}
				else {
					requestQueue.push(reqData);
					notifyCb({ id : 95, msg : "Queuing Request"});
				}
			}
		}
		function deviceStatusChange(type, status) {
			console.log("Device Status has change. New status is " + status);
			if(status==="DETACHED") {
				socket=null;
				agent=null;
				isInitializing=false;
				isBusy=false;
			}
			if(status==="ATTACHED") {
				initializeSAP();
			}
		}
		
		return { 
			configure: configure,
			initializeSAP: initializeSAP,
			sapRequest : sapRequest
			
			};
		
	}
});



var callback = {
	onrequest : onReceive,
	onconnect : onConnect,
	onerror : onError
};

var peerAgentFindCallback = {
	onpeeragentfound : onPeerAgentFound,
	onpeeragentupdated : onPeerAgentUpdated,
	onerror : onError
};

function receiveAgents(agents) {
	console.log("Received agents (count " + agents.length + ")");
	agent=agents[0];
	try {
		agent.setPeerAgentFindListener(peerAgentFindCallback);
		agent.findPeerAgents();
		console.log("Initiated peer connection");
	}
	catch(e) {
		console.log("Exception: " + e.name + " - " + e.message);
		isInitializing=false;
	}
} 

function onPeerAgentFound(peerAgent) {
	if(peerAgent.appName===providerApp) {
		try {
			agent.setServiceConnectionListener(callback);
			agent.requestServiceConnection(peerAgent);
		}
		catch(e) {
			console.log("Exception: " + e.name + " - " + e.message);
			isInitializing=false;
		}
	}
	else {
		console.log("Unexpected peer: " + peerAgent.appName + " - was looking for: " + providerApp);
	}
}

function onPeerAgentUpdated(peerAgent, status) {
	if(status==="AVAILABLE") {
		try {
			agent.requestServiceConnection(peerAgent);
		}
		catch(e) {
			console.log("Exception: " + e.name + " - " + e.message);
		}
	}
	else if(status==="UNAVAILABLE") {
		console.log("Application Package on remote device is uninstalled");
		isInitializing=false;
	}
}

function onConnect(sock) {
	console.log("ServiceConnection onConnect");
	isBusy=true;
	socket=sock;
	socket.setDataReceiveListener(onReceive);
	socket.setSocketStatusListener(onSockStatusChange);
	if(requestQueue.length>0) {
		notifyCb({ idx:101, msg:"Sending " + requestQueue.length + " queued Requests"});
		while(requestQueue.length>0) {
			socket.sendData(channel, JSON.stringify(requestQueue.shift().reqData));
		}
		notifyCb({ idx:102, msg:"Waiting for Response"});
	}
	isBusy=false;
	isInitializing=false;
}

function onError(errorCode) {
	console.log("Error code: " + errorCode);
	if(errorCode==="PEER_NOT_FOUND") {
		console.log("If remote application is already installed on the remote device, please wait...");
		failCb({
				name : errorCode,
				message : "Application on phone not found"
			});
	}
	if(errorCode==="DEVICE_NOT_CONNECTED") {
		console.log("There seems to be no connection between Gear and Phone");
		failCb({
				name : errorCode,
				message : "Phone is not connected"
			});
	}
	isInitializing=false;
	isBusy=false;
}

function onReceive(channel, jsonData) {
	console.log("Received data: " + jsonData);
	receiveCb(JSON.parse(jsonData));
}

function onSockStatusChange(errCode) {
	console.log("Socket disconnected: " + errCode);
	
	if(errCode==="PEER_DISCONNECTED") {
		socket=null;
		isInitializing=false;
		isBusy=false;
	}
}








