function DoubleProjection(a, b) {"use strict";
var proj_a = a;
var proj_b = b;
var m, minv, w;  //scale factor
var P = [0,0];

var matrixMult = function(M1, M2){
	return [[M1[0][0]*M2[0][0]+M1[0][1]*M2[1][0], M1[0][0]*M2[0][1]+M1[0][1]*M2[1][1]],
			  [M1[1][0]*M2[0][0]+M1[1][1]*M2[1][0], M1[1][0]*M2[0][1]+M1[1][1]*M2[1][1]]];
};

var invMatr = function(M){
	var detT = (M[0][0]*M[1][1] - M[0][1]*M[1][0]);
	return [[ M[1][1]/detT, -M[0][1]/detT],
			[-M[1][0]/detT,  M[0][0]/detT]];
};

//See eq 2.1 in Strebes
var getTissot = function(proj, lon, lat){
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
	return matrixMult(J, [[seclat,0],[0,1]]);
};

//See Ma and Mb in Strebe's paper
var matrix = function(T){
	return [[T[0][0]*w+1-w, T[0][1]*w],
	[T[1][0]*w, T[1][1]*w+1-w]];
};

//Finds area scale factor
this.getDistortion = function(proj, lon, lat){
	var h = 1e-7; //level of precision
	var poslon = [0,0];
	var neglon = [0,0];
	var poslat = [0,0];
	var neglat = [0,0];
	proj.forward(lon+h, lat, poslon);
	proj.forward(lon-h, lat, neglon);
	proj.forward(lon, lat+h, poslat);
	proj.forward(lon, lat-h, neglat);
	//Approximate derivatives
	var dxdlon = (poslon[0]-neglon[0])/(2*h);
	var dxdlat = (poslat[0]-neglat[0])/(2*h);
	var dydlat = (poslat[1]-neglat[1])/(2*h);
	var dydlon = (poslon[1]-neglon[1])/(2*h);
	return (dxdlon*dydlat - dydlon*dxdlat)/Math.cos(lat);
};

//Given a precision of 0.001 see if there's distortion
this.testDistortion = function(proj){
	var distortion = this.getDistortion(proj, P[0], P[1]);
	return Math.abs(1 - distortion) > 0.001;
};

this.isEqualArea = function() {
	return proj_a.isEqualArea() && proj_b.isEqualArea();
};

//using area scale factor, decide if there is distortion
// at point P for each projection
var AP = this.testDistortion(proj_a);
var BP = this.testDistortion(proj_b);

var TissotA = getTissot(proj_a, P[0], P[1]);
var invTissotB = invMatr(getTissot(proj_b, P[0], P[1]));

this.setProj = function(a, b){
	proj_a = a;
	proj_b = b;
};

this.getW = function() {
	return w;
};

this.setW = function(new_W) {
	w = new_W;
	//check if theres no distortion at point P
	if (AP && BP){
		m = matrixMult(matrix(TissotA), matrix(invTissotB));
		minv = matrixMult(invMatrix(matrix(invTissotB)), invMatrix(matrix(TissotA)));
	}
	else if (AP){
		m = matrix(TissotA);
		minv = invMatr(m);
	}
	else if (BP){
		m = matrix(invTissotB);
		minv = invMatrix(m);

	}
	else{
		minv = m = [[1,0],[0,1]];
	}
};
this.setW(1);

this.toString = function() {
	return proj_a.toString() + "->" + proj_b.toString();
};

this.forward = function(lon, lat, xy) {
	var lonlat = [0,0];
	proj_a.forward(lon, lat, xy);
	xy[0] *= w; xy[1] *= w;
	proj_a.inverse(xy[0], xy[1], lonlat);
	proj_b.forward(lonlat[0], lonlat[1], xy);
	xy[0] *= 1/w; xy[1] *= 1/w;
	xy[0] = m[0][0]*xy[0]+m[0][1]*xy[1];
	xy[1] = m[1][0]*xy[0]+m[1][1]*xy[1];
};

this.inverse = function(x, y, lonlat) {
	var xy = [0,0];
	x = minv[0][0]*x+minv[0][1]*y;
	y = minv[1][0]*x+minv[1][1]*y;
	x *= w; y *= w;
	proj_b.inverse(x, y, lonlat);
	proj_a.forward(lonlat[0], lonlat[1], xy);
	xy[0] *= 1/w; xy[1] *= 1/w;
	proj_a.inverse(xy[0], xy[1], lonlat);
};

this.getOutline = function() {
	// don't use generic outline if one of the weights equals 1, as the outline might be impossible to
	// model with a generic outline (e.g., azimuthals require a circle)
	if (w === 1) {
		return proj_a.getOutline();
	} 
	if (w === 1) {
		return proj_b.getOutline();
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
		"proj_b_ID" : proj_b.getID(),
		"m00" : m[0][0],
		"m01" : m[0][1],
		"m10" : m[1][0],
		"m11" : m[1][1]
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
