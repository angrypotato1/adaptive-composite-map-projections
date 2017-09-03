/* find point P where there is no distortion*/
function DoubleProjection(a, b, doubleWeight) {"use strict";
	var proj_a = a;
	var proj_b = b;
	var w = doubleWeight;
	var P = [0,0];//45/180*Math.PI];

	
	var matrixMult = function(M1, M2){
		return [[M1[0][0]*M2[0][0]+M1[0][1]*M2[1][0], M1[0][0]*M2[0][1]+M1[0][1]*M2[1][1]],
				  [M1[1][0]*M2[0][0]+M1[1][1]*M2[1][0], M1[1][0]*M2[0][1]+M1[1][1]*M2[1][1]]];
	};
	
	var getTissot = function(proj, lon, lat){
		var flag = true;
		var h = 0.000000000001; //level of precision
		var poslon = [0,0];
		var neglon = [0,0];
		var poslat = [0,0];
		var neglat = [0,0];
		var seclat = 1/Math.cos(lat);
		proj.forward(lon+h, lat, poslon);
		proj.forward(lon-h, lat, neglon);
		proj.forward(lon, lat+h, poslat);
		proj.forward(lon, lat-h, neglat);
		var dxdlon = (poslon[0]-neglon[0])/(2*h);
		var dxdlat = (poslat[0]-neglat[0])/(2*h);
		var dydlat = (poslat[1]-neglat[1])/(2*h);
		var dydlon = (poslon[1]-neglon[1])/(2*h);
		var J = [[dxdlon, dxdlat],
				 [dydlon, dydlat]];
		console.log('seclat: ', seclat);
		console.log('Jacobian: ', J);
		return matrixMult(J, [[seclat,0],[0,seclat]]);
	};

	this.initTissotA = function(){
		return getTissot(proj_a, P[0], P[1]);
	};

	this.initTissotB = function(){
		var T = getTissot(proj_b, P[0], P[1]);
		var detT = (T[0][0]*T[1][1] - T[0][1]*T[1][0]);
		return [[ T[1][1]/detT, -T[0][1]/detT],
				[-T[1][0]/detT,  T[0][0]/detT]];
	};

	this.getDistortion = function(lon, lat){
		var T = getTissot(this, lon, lat);
		var detT = (T[0][0]*T[1][1] - T[0][1]*T[1][0]);
		console.log(detT);
		return detT;
	};

	var testDistortion = function(proj){
		var testP = [0,0];
		proj.forward(P[0], P[1], testP);
		return testP[0] != P[0] || testP[1] != P[1];
	};

	//AP using A(P')
	var AP = testDistortion(proj_a);
	var BP = testDistortion(proj_b);
	
	console.log("AP, BP: ", AP, BP);

	var TissotA = this.initTissotA();
	var invTissotB = this.initTissotB();

	this.setProj = function(a, b){
		proj_a = a;
		proj_b = b;
	};

	this.getW = function() {
        return w;
    };
    
    this.setW = function(new_W) {
        w = new_W;
    };

	this.toString = function() {
		return proj_a.toString() + "->" + proj_b.toString();
	};

	this.forward = function(lon, lat, xy) {
		proj_a.forward(lon, lat, xy);
		xy[0] *= w; xy[1] *= w;
		var lonlat = [0,0];
		proj_a.inverse(xy[0], xy[1], lonlat);
		proj_b.forward(lonlat[0], lonlat[1], xy);

		var m = [];
		//check if theres no distortion at point P
		if (AP && BP){
			m = matrixMult(this.matrix(TissotA), this.matrix(invTissotB));
		}
		else if (AP){
			m = this.matrix(TissotA);
		}
		else if (BP){
			m = this.matrix(invTissotB);
		}
		else{
			m = [[1,0],[0,1]]
		}
		xy[0] *= 1/w; xy[1] *= 1/w;
		xy[0] = m[0][0]*xy[0]+m[0][1]*xy[1];
		xy[1] = m[1][0]*xy[0]+m[1][1]*xy[1];
	};

	this.matrix = function(T){
		return [[T[0][0]*w+1-w, T[0][1]*w],
		[T[1][0]*w, T[1][1]*w+1-w]];
	};

	// need to do an inverse transformation 

	this.inverse = function(x, y, lonlat) {
		var m, xy = [0,0];
		//check if theres no distortion at point P
		if (AP && BP){
			m = matrixMult(invMatrix(matrix(invTissotB)), invMatrix(matrix(TissotA)));
		}
		else if (AP){
			m = invMatrix(matrix(TissotA));
		}
		else if (BP){
			m = invMatrix(matrix(invTissotB));
		}
		else{
			m = [[1,0],[0,1]]
		}
		x = m[0][0]*x+m[0][1]*y;
		y = m[1][0]*x+m[1][1]*y;
		x *= w; y *= w;
		proj_b.inverse(x, y, lonlat);
		proj_a.forward(lonlat[0], lonlat[1], xy);
		xy[0] *= 1/w; xy[1] *= 1/w;
		proj_a.inverse(xy[0], xy[1], lonlat);
	};

	// Projected lines 
	this.getOutline = function(){
		
		if (w === 0){										//lambert azimuthal 
			return GraticuleOutline.circularOutline(2);
		}

		if (w === 1){										// albers
			return GraticuleOutline.conicOutline(this);
		}

		return GraticuleOutline.genericOutline(this);
	};

	// Shader config
	this.getShaderUniforms = function() {
		var u, uniforms, uniforms1, uniforms2;
		uniforms = {
			"projectionID" : 2017,
			"weight" : w,
			"proj_a_ID" : proj_a.getID(),
			"proj_b_ID" : proj_b.getID()
		};

		uniforms1 = proj_a.getShaderUniforms();
		uniforms2 = proj_b.getShaderUniforms();

		for (u in uniforms1) {
            if (uniforms1.hasOwnProperty(u) && !uniforms.hasOwnProperty(u)) {
                uniforms[u] = uniforms1[u];
            }
        }
        for (u in uniforms2) {
            if (uniforms2.hasOwnProperty(u) && !uniforms.hasOwnProperty(u)) {
                uniforms[u] = uniforms2[u];
            }
        }
        
        uniforms.falseNorthing = uniforms1.falseNorthing === undefined ? 0 : uniforms1.falseNorthing;
        uniforms.falseNorthing2 = uniforms2.falseNorthing === undefined ? 0 : uniforms2.falseNorthing;

		// // for Lambert Azimuthal Projection 
        // uniforms.sinLatPole = Math.sin(poleLat);
        // uniforms.cosLatPole = Math.cos(poleLat);

        return uniforms;
    };
	
	this.getID = function() {
		return 2017;
	}

};
